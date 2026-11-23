// Nubes REALES: recortes de cúmulos de la foto del panorama de día (Poly Haven, CC0), con transparencia
// (nubes.webp, un atlas de 8). Se dibujan como carteles que miran a la cámara, todos en UNA llamada
// (instancias), ordenados de lejos a cerca para que la transparencia quede bien.
//   · capa: el mar de nubes. En el hero está abajo de la estatua y llega hasta el horizonte; al caer, la
//     cámara la atraviesa a toda velocidad (paralaje fuerte: las cercanas pasan volando) y después queda
//     arriba, como techo, vista desde abajo.
//   · cruce: nubes cerca del camino de la cámara, solo para sentir la velocidad al atravesar.
//   · lejana suave (4ª capa): un velo de nubes muy tenue en el horizonte, SOLO en calidad alta.
// Desenfoque de movimiento leve: con la caída rápida cada nube se estira en vertical y se lee 3 veces.
// Velo: cuando la cámara está adentro de la capa, una niebla de nube cubre la pantalla un instante.
import { CAIDA } from '../../config/historia.js';
import { SKY_LAYER } from './foto-cielo.js';

// rectángulos del atlas: [u, v, ancho, alto, aspecto] (salen de scripts de armado del atlas)
const ATLAS = [
  [0.0, 0.8125, 0.5, 0.125, 4.0], [0.5, 0.7583, 0.5, 0.23389, 2.1378], [0.0, 0.52539, 0.5, 0.19971, 2.5037],
  [0.57715, 0.5, 0.3457, 0.25, 1.3828], [0.0, 0.31543, 0.5, 0.11914, 4.1967], [0.62744, 0.25, 0.24463, 0.25, 0.9785],
  [0.0, 0.01758, 0.5, 0.21484, 2.3273], [0.55371, 0.0, 0.39258, 0.25, 1.5703],
];
export const COUNT = {
  capa: { high: 170, medium: 110, low: 60 },
  cruce: { high: 46, medium: 30, low: 16 },
  lejana: { high: 44, medium: 0, low: 0 },
};

const VERTEX = /* glsl */`
attribute vec3 aC;
attribute vec2 aS;
attribute vec4 aR;
attribute vec2 aK; // tipo (0 capa, 1 cruce, 2 lejana) · semilla
uniform float uDeckY, uStreak, uDrift, uTime;
uniform vec3 uKind; // opacidad de cada tipo
varying vec2 vUv; varying vec4 vR; varying float vA; varying float vDist; varying float vSeed;
void main(){
  vec3 c = aC + vec3(uDrift * (aK.x > 1.5 ? 0.4 : 1.0), uDeckY, 0.0);
  c.x += sin(uTime * 0.05 + aK.y * 30.0) * 1.5;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float stretch = 1.0 + uStreak * (aK.x > 0.5 && aK.x < 1.5 ? 1.6 : 0.7);
  vec3 p = c + right * position.x * aS.x + up * position.y * aS.y * stretch;
  vUv = uv; vR = aR; vSeed = aK.y;
  vDist = length(c - cameraPosition);
  vA = aK.x < 0.5 ? uKind.x : (aK.x < 1.5 ? uKind.y : uKind.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // fuera de pantalla: no cuesta nada
}`;

const FRAGMENT = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uLit, uShade, uHaze;
uniform float uStreak, uOpacity, uFar;
varying vec2 vUv; varying vec4 vR; varying float vA; varying float vDist; varying float vSeed;
vec4 tap(vec2 uv){ return texture2D(uMap, vR.xy + clamp(uv, 0.002, 0.998) * vR.zw); }
void main(){
  vec4 t = tap(vUv);
  if (uStreak > 0.02) { // desenfoque de movimiento vertical: tres lecturas a lo largo de la caída
    float s = uStreak * 0.05;
    t = t * 0.4 + tap(vUv + vec2(0.0, s)) * 0.3 + tap(vUv - vec2(0.0, s)) * 0.3;
  }
  float l = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = mix(uShade, uLit, smoothstep(0.2, 0.95, l)) * (0.82 + 0.3 * l);
  col = mix(col, uHaze, smoothstep(uFar * 0.25, uFar, vDist) * 0.85);   // se funden con la bruma lejos
  float a = t.a * vA * uOpacity;
  a *= smoothstep(1.2, 7.0, vDist);                                  // la que pasa por la cámara se abre
  a *= 1.0 - smoothstep(uFar * 0.82, uFar, vDist);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const VEIL_FRAGMENT = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uColor, uShade;
uniform float uAmount, uScroll, uAspect;
varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  // dos lecturas del atlas a escala de pantalla, corriendo hacia arriba (la nube pasa)
  float a1 = texture2D(uMap, fract(p * 0.55 + vec2(0.13, -uScroll * 0.9))).a;
  float a2 = texture2D(uMap, fract(p * 0.9 + vec2(0.61, -uScroll * 1.6))).a;
  float d = clamp(a1 * 0.6 + a2 * 0.5, 0.0, 1.0);
  vec3 col = mix(uShade, uColor, 0.55 + 0.45 * d);
  float a = uAmount * (0.55 + 0.45 * d);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export function createFotoNubes(ctx, { track, tier }) {
  const { THREE, root, renderer, camera, assetsPath: A } = ctx;
  const res = tier === 'low' ? '-1k' : '';
  let done;
  const ready = new Promise((r) => (done = r));
  const map = track(new THREE.TextureLoader().load(`${A}cielo/nubes${res}.webp`, () => done(), undefined, () => done()));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  map.premultiplyAlpha = false;

  // ---------- reparto (fijo, con semilla) ----------
  let seed = 913;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const items = [];
  const [e0, e1] = CAIDA.espesor;
  function add(kind, x, y, z, h) {
    const r = ATLAS[Math.floor(rand() * ATLAS.length)];
    items.push({ kind, x, y, z, w: h * r[4], h, r, s: rand() });
  }
  const NC = COUNT.capa.high, NX = COUNT.cruce.high, NL = COUNT.lejana.high;
  for (let i = 0; i < NC; i++) {
    // más densas cerca del horizonte visto desde el hero (anillo de 8 a 330 m)
    const rr = 8 + Math.pow(rand(), 0.75) * 322;
    const a = rand() * Math.PI * 2;
    add(0, Math.sin(a) * rr, e0 + rand() * (e1 - e0), Math.cos(a) * rr - 20, 9 + rand() * 26 + rr * 0.05);
  }
  for (let i = 0; i < NX; i++) {
    // alrededor del camino de la cámara (la cámara mira la estatua desde z ≈ +9)
    const rr = 2.2 + rand() * 14;
    const a = rand() * Math.PI * 2;
    add(1, Math.sin(a) * rr, e0 + rand() * (e1 - e0), 5 + Math.cos(a) * rr, 3 + rand() * 9);
  }
  for (let i = 0; i < NL; i++) {
    const a = rand() * Math.PI * 2, rr = 270 + rand() * 90;
    add(2, Math.sin(a) * rr, e1 - 4 + rand() * 10, Math.cos(a) * rr, 26 + rand() * 30);
  }
  const N = items.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = track(new THREE.InstancedBufferGeometry());
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  const aR = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  [aC, aS, aR, aK].forEach((x) => x.setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aC', aC); geo.setAttribute('aS', aS); geo.setAttribute('aR', aR); geo.setAttribute('aK', aK);
  geo.instanceCount = N;

  // qué instancias existen en esta calidad (las que sobran no se escriben)
  let active = [];
  function pickActive(t) {
    let c = 0, x = 0, l = 0;
    active = items.filter((it) => {
      if (it.kind === 0) return c++ < COUNT.capa[t];
      if (it.kind === 1) return x++ < COUNT.cruce[t];
      return l++ < COUNT.lejana[t];
    });
    geo.instanceCount = active.length;
  }
  pickActive(tier);

  const uniforms = {
    uMap: { value: map }, uDeckY: { value: 0 }, uStreak: { value: 0 }, uDrift: { value: 0 }, uTime: { value: 0 },
    uKind: { value: new THREE.Vector3(1, 1, 0.35) },
    uLit: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#9aa6b8') }, uHaze: { value: new THREE.Color('#e6ecf0') },
    uOpacity: { value: 1 }, uFar: { value: 360 },
  };
  const material = track(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'foto_nubes';
  mesh.frustumCulled = false;
  mesh.renderOrder = -60;
  mesh.layers.enable(SKY_LAYER);
  root.add(mesh);

  // ---------- velo (adentro de la nube) ----------
  const veilU = {
    uMap: { value: map }, uColor: { value: new THREE.Color('#f7f8fa') }, uShade: { value: new THREE.Color('#c8cfd8') },
    uAmount: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1 },
  };
  const veil = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), track(new THREE.ShaderMaterial({
    uniforms: veilU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: VEIL_FRAGMENT,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  })));
  veil.name = 'foto_nubes_velo';
  veil.frustumCulled = false;
  veil.renderOrder = 900;
  veil.visible = false;
  root.add(veil);

  // ---------- orden de lejos a cerca (solo si la cámara se movió) ----------
  const order = [];
  const last = new THREE.Vector3(1e9, 0, 0);
  let lastDeck = 1e9;
  const tmp = new THREE.Vector3();
  function writeSorted(deckY) {
    tmp.copy(camera.position);
    if (tmp.distanceToSquared(last) < 0.25 && Math.abs(deckY - lastDeck) < 0.4) return;
    last.copy(tmp); lastDeck = deckY;
    order.length = 0;
    for (let i = 0; i < active.length; i++) {
      const it = active[i];
      const dx = it.x - tmp.x, dy = it.y + deckY - tmp.y, dz = it.z - tmp.z;
      it.d = dx * dx + dy * dy + dz * dz;
      order.push(it);
    }
    order.sort((a, b) => b.d - a.d);
    for (let i = 0; i < order.length; i++) {
      const it = order[i];
      aC.array[i * 3] = it.x; aC.array[i * 3 + 1] = it.y; aC.array[i * 3 + 2] = it.z;
      aS.array[i * 2] = it.w; aS.array[i * 2 + 1] = it.h;
      aR.array[i * 4] = it.r[0]; aR.array[i * 4 + 1] = it.r[1]; aR.array[i * 4 + 2] = it.r[2]; aR.array[i * 4 + 3] = it.r[3];
      aK.array[i * 2] = it.kind; aK.array[i * 2 + 1] = it.s;
    }
    aC.needsUpdate = aS.needsUpdate = aR.needsUpdate = aK.needsUpdate = true;
  }

  function resize(w, h) { veilU.uAspect.value = w / h; }

  return {
    mesh, veil, uniforms, veilU, ready,
    resize,
    /** deckY = altura del mundo de la capa (y), kinds = opacidad de cada tipo, streak = estela (0..1) */
    update(deckY, time, dt, { capa, cruce, lejana, streak, drift }) {
      uniforms.uDeckY.value = deckY;
      uniforms.uTime.value = time;
      uniforms.uStreak.value = streak;
      uniforms.uDrift.value = drift;
      uniforms.uKind.value.set(capa, cruce, lejana);
      const on = capa > 0.003 || cruce > 0.003 || lejana > 0.003;
      if (mesh.visible !== on) mesh.visible = on;
      if (on) writeSorted(deckY);
    },
    setQuality(t) { pickActive(t); last.set(1e9, 0, 0); },
  };
}
