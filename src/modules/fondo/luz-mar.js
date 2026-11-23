// El mar de "Hecha de luz" (y la orilla de Contacto).
//  · olas suaves: 4 ondas Gerstner en el vertex shader (en calidad baja, sin olas: solo normales)
//  · normales animadas: dos lecturas de agua-normales.webp que se mueven distinto
//  · reflejo del cielo: CubeCamera de 128 px que dibuja SOLO el cielo y las nubes (capa 2). Se actualiza
//    únicamente al cambiar de sala: hay dos cubos (A y B) y el agua cruza de uno al otro, así el cambio
//    no salta. Nada de Reflector (no se dibuja la escena dos veces).
//  · camino de sol: brillo duro + purpurina; los destellos con forma de estrella van aparte (destellos.js)
//  · el mouse deja ondas en el agua (8 ondas que se reciclan)
//  · Contacto: la orilla. Arena mojada que espeja el cielo de la hora azul y una línea de espuma.
import { HASH } from './luz-glsl.js';
import { SKY_LAYER } from './foto-cielo.js';
import { loadTex } from './texturas.js';
import { NIVEL_MAR } from '../../config/historia.js';

export const SEA_Y = NIVEL_MAR;
const MAX_RIPPLES = 8;
const SIZE = 320;

// dirección (x, z), número de onda k = 2π/λ y amplitud (m)
const WAVES = [
  [0.88, -0.47, (2 * Math.PI) / 9.5, 0.06],
  [0.35, -0.94, (2 * Math.PI) / 5.6, 0.04],
  [-0.62, -0.78, (2 * Math.PI) / 3.3, 0.022],
  [0.98, 0.2, (2 * Math.PI) / 2.1, 0.012],
];

const VERTEX = /* glsl */`
uniform float uTime, uWaves, uAmp, uSteep;
uniform vec4 uW[4];
varying vec3 vW;
varying vec3 vN;
varying float vCrest;
void main(){
  vCrest = 0.0;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 p = wp.xyz;
  vec3 n = vec3(0.0, 1.0, 0.0);
  if (uWaves > 0.5) {
    vec3 d = vec3(0.0);
    vec3 nn = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < 4; i++) {
      // Gerstner: la cresta se corre hacia adelante (uSteep = inclinación, chica: olas suaves sin rulos)
      vec2 D = uW[i].xy; float k = uW[i].z; float A = uW[i].w * uAmp;
      float ph = k * dot(D, p.xz) - sqrt(9.8 * k) * uTime;
      float c = cos(ph), s = sin(ph);
      d.x += uSteep * A * D.x * c; d.z += uSteep * A * D.y * c; d.y += A * s;
      nn.x -= D.x * k * A * c; nn.z -= D.y * k * A * c; nn.y -= uSteep * k * A * s;
    }
    float fade = 1.0 - smoothstep(50.0, 170.0, length(p.xz - cameraPosition.xz)); // lejos no se ven
    p += d * fade;
    n = normalize(mix(vec3(0.0, 1.0, 0.0), nn, fade));
    vCrest = clamp(d.y / (0.13 * max(uAmp, 0.05)), -1.0, 1.0) * fade;   // −1 valle · 1 cresta
  }
  vW = p; vN = n;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */`
uniform samplerCube uEnvA, uEnvB;
uniform sampler2D uNormal;
uniform vec3 uSunDir, uSunColor, uDeep, uShallow, uHaze, uFadeCol, uSand, uFoam;
uniform float uTime, uEnvMix, uDetail, uSpec, uGlitter, uReflI, uHazeI, uFade, uShore, uShoreZ, uRipOn, uHazeN, uHazeF;
uniform vec4 uRip[${MAX_RIPPLES}];
// película: luz turquesa a contraluz en las crestas, espuma, bioluminiscencia (hora azul) y efectos de sala
uniform vec3 uSSSCol, uBioCol, uInkCol;
uniform float uSSS, uFoamK, uBio, uInk, uInkR, uPalm;
varying vec3 vW;
varying vec3 vN;
varying float vCrest;
${HASH}
float gRipE = 0.0; // energía de las ondas del mouse en este punto (la bioluminiscencia la usa)
vec2 ripples(vec2 p){
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRip[i]; float age = uTime - r.z;
    if (age < 0.0 || age > 6.0 || r.w <= 0.0) continue;
    vec2 dv = p - r.xy; float dist = length(dv); float front = age * 1.9;
    float env = exp(-pow(dist - front, 2.0) * 1.4) * exp(-age * 0.7) * r.w;
    float w = sin((dist - front) * 6.0) * env;
    g += (dv / (dist + 1e-3)) * w;
    gRipE += env * (1.0 - smoothstep(0.0, 6.0, age));
  }
  return g;
}
vec3 sky(vec3 r){ return mix(textureCube(uEnvA, r).rgb, textureCube(uEnvB, r).rgb, uEnvMix); }
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition.xz - vW.xz);
  float nearK = 1.0 - smoothstep(25.0, 160.0, dist);
  vec3 N = normalize(vN);
  vec3 n1 = texture2D(uNormal, vW.xz * 0.055 + vec2(uTime * 0.011, uTime * 0.007)).xzy * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, vW.xz * 0.16 + vec2(-uTime * 0.009, uTime * 0.013)).xzy * 2.0 - 1.0;
  N = normalize(N + vec3(n1.x + n2.x * 0.7, 0.0, n1.z + n2.z * 0.7) * uDetail * (0.35 + 0.65 * nearK));
  if (uRipOn > 0.5) { vec2 rp = ripples(vW.xz); N = normalize(N + vec3(-rp.x, 0.0, -rp.y) * 0.5); }
  // SALA TINTA NEGRA: agua como tinta que se expande desde la estatua (las normales se aquietan adentro)
  float ink = 0.0;
  if (uInk > 0.001) {
    float rr = length(vW.xz) + (n1.x + n2.z) * 0.9;
    ink = (1.0 - smoothstep(uInkR - 2.5, uInkR, rr)) * uInk;
    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), ink * 0.6));
  }

  vec3 R = reflect(-V, N); R.y = abs(R.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 0.75, 1.0 - V.y));
  vec3 col = mix(body, sky(R), clamp(fres * uReflI, 0.0, 1.0));
  // camino de sol: lóbulo ancho + brillo duro + purpurina de un píxel
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 55.0) * 0.32 + pow(sd, 650.0) * 2.6) * uSpec;
  col += uSunColor * pow(sd, 1800.0) * step(0.5, hash12(floor(vW.xz * 6.0))) * uGlitter * 9.0;

  // luz que atraviesa las crestas a contraluz (turquesa): mirando hacia el sol, en la parte alta de la ola
  vec2 toSun = normalize(uSunDir.xz + 1e-4), look = normalize(-V.xz + 1e-4);
  float back = pow(max(dot(look, toSun), 0.0), 3.0);
  float crest = smoothstep(0.15, 0.95, vCrest + (n1.x + n2.x) * 0.25);
  col += uSSSCol * uSunColor * crest * back * (0.35 + 0.65 * (1.0 - V.y)) * nearK * uSSS;
  // espuma fina en lo más alto de las crestas
  float foamN = hash12(floor(vW.xz * 24.0 + vec2(uTime * 0.7, 0.0)));
  col += uFoam * smoothstep(0.82, 1.0, vCrest + n2.x * 0.35) * (0.4 + 0.6 * foamN) * nearK * uFoamK * 0.35;
  // tinta: casi negra, con el reflejo del cielo apenas
  col = mix(col, uInkCol + sky(R) * fres * 0.25, ink);
  // SALA AURA AIKA: sombras de palmeras proyectadas en el agua (dos palmeras fuera de cuadro, a un costado)
  if (uPalm > 0.001) {
    float sh = 0.0;
    for (int i = 0; i < 2; i++) {
      vec2 c = i == 0 ? vec2(-9.0, -5.0) : vec2(-15.0, 3.0);
      vec2 q = vW.xz - c; float r = length(q); float a = atan(q.y, q.x);
      float sway = sin(uTime * 0.6 + float(i) * 2.0) * 0.05;
      float frond = smoothstep(0.55, 0.95, abs(sin(a * 4.5 + sway + sin(r * 0.6) * 0.25)));
      frond *= smoothstep(9.0, 3.0, r) * smoothstep(0.3, 1.4, r);
      float serr = 0.75 + 0.25 * sin(a * 80.0 + r * 3.0);               // el borde dentado de las hojas
      sh = max(sh, frond * serr);
    }
    col *= 1.0 - sh * 0.5 * uPalm;
  }
  // HORA AZUL: bioluminiscencia, puntitos turquesa donde el mouse o el dedo movió el agua
  if (uBio > 0.001) {
    vec2 cell = floor(vW.xz * 9.0);
    float h = hash12(cell);
    vec2 f = fract(vW.xz * 9.0) - 0.5 - (vec2(hash12(cell + 7.1), hash12(cell + 3.3)) - 0.5) * 0.6;
    float dotm = smoothstep(0.16, 0.0, length(f)) * step(0.55, h);
    float tw = 0.6 + 0.4 * sin(uTime * (3.0 + h * 5.0) + h * 40.0);
    col += uBioCol * dotm * tw * clamp(gRipE * 1.6, 0.0, 1.0) * uBio * 3.0;
    col += uBioCol * clamp(gRipE, 0.0, 1.0) * uBio * 0.06;              // un velo turquesa muy leve en la estela
  }

  // orilla: arena mojada que espeja el cielo, con la línea de espuma que sube y baja
  if (uShore > 0.001) {
    float edge = uShoreZ + 0.7 * sin(vW.x * 0.17 + 1.2) + 0.3 * sin(vW.x * 0.47 + uTime * 0.21) + (sin(uTime * 0.36) * 0.5 + 0.5) * 0.9;
    float sand = smoothstep(edge - 0.35, edge + 0.35, vW.z);
    vec3 Ns = normalize(vec3(0.0, 1.0, 0.0) + vec3(n1.x, 0.0, n1.z) * 0.06);
    vec3 Rs = reflect(-V, Ns); Rs.y = abs(Rs.y);
    float fs = 0.08 + 0.92 * pow(1.0 - max(V.y, 0.0), 3.0);
    vec3 wet = mix(uSand, sky(Rs), clamp(0.25 + fs * 0.7, 0.0, 1.0));
    float foam = (1.0 - smoothstep(0.0, 0.3, abs(vW.z - edge))) * (0.5 + 0.5 * hash12(floor(vW.xz * 22.0)));
    col = mix(col, wet, sand * uShore);
    col += uFoam * foam * uShore * 0.4;
  }
  vec3 hz = sky(normalize(vec3(-V.x, 0.015, -V.z)));               // el cielo en el horizonte de esa dirección
  col = mix(col, mix(uHaze, hz, 0.75), smoothstep(uHazeN, uHazeF, dist) * uHazeI); // se funde con la foto
  col = mix(uFadeCol, col, uFade);                                 // aparición desde la bruma
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createMar(ctx, { track, tier, sunDir }) {
  const { THREE, root, renderer, scene, camera, assetsPath: A } = ctx;

  // grilla más densa cerca de la estatua (donde se ven las olas) y rala hacia el horizonte
  const seg = 180;
  const geo = track(new THREE.PlaneGeometry(2, 2, seg, seg));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 2.3) * SIZE, 0, Math.sign(z) * Math.pow(Math.abs(z), 2.3) * SIZE - 4);
  }
  geo.computeBoundingSphere();

  const normalTex = track(loadTex(THREE, A + 'claroscuro/agua-normales.webp'));
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.anisotropy = 4;

  const cubeOpts = { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter };
  const cubes = [track(new THREE.WebGLCubeRenderTarget(128, cubeOpts)), track(new THREE.WebGLCubeRenderTarget(128, cubeOpts))];
  const cubeCam = new THREE.CubeCamera(0.5, 400, cubes[0]);
  cubeCam.children.forEach((c) => c.layers.set(SKY_LAYER)); // solo cielo y nubes
  cubeCam.position.set(0, SEA_Y + 1.5, 0);
  root.add(cubeCam);

  const rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  let ripIdx = 0;
  const uniforms = {
    uTime: { value: 0 }, uWaves: { value: tier === 'low' ? 0 : 1 }, uAmp: { value: 1 }, uSteep: { value: 1.6 },
    uW: { value: WAVES.map(([x, z, k, a]) => new THREE.Vector4(x, z, k, a)) },
    uEnvA: { value: cubes[0].texture }, uEnvB: { value: cubes[1].texture }, uEnvMix: { value: 0 },
    uNormal: { value: normalTex },
    uSunDir: { value: sunDir }, uSunColor: { value: new THREE.Color('#ffc98a') },
    uDeep: { value: new THREE.Color('#2b2630') }, uShallow: { value: new THREE.Color('#6e5a55') },
    uHaze: { value: new THREE.Color('#e9b98c') }, uFadeCol: { value: new THREE.Color('#f5efe4') },
    uSand: { value: new THREE.Color('#23262d') }, uFoam: { value: new THREE.Color('#c9d3ee') },
    uDetail: { value: 0.55 }, uSpec: { value: 1 }, uGlitter: { value: 1 }, uReflI: { value: 1 }, uHazeI: { value: 1 },
    uFade: { value: 0 }, uShore: { value: 0 }, uShoreZ: { value: -2.6 }, uHazeN: { value: 35 }, uHazeF: { value: 270 },
    uRipOn: { value: 1 }, uRip: { value: rip },
    uSSSCol: { value: new THREE.Color('#1fd1b8') }, uSSS: { value: tier === 'low' ? 0.5 : 1 }, uFoamK: { value: 1 },
    uBioCol: { value: new THREE.Color('#2ff5d6') }, uBio: { value: 0 },
    uInkCol: { value: new THREE.Color('#040306') }, uInk: { value: 0 }, uInkR: { value: 0 }, uPalm: { value: 0 },
  };
  const material = track(new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, toneMapped: false }));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'luz_mar';
  mesh.position.y = SEA_Y;
  mesh.renderOrder = -40;
  mesh.frustumCulled = false;
  mesh.visible = false;
  root.add(mesh);

  let front = 0; // cubo que el agua muestra "del todo" (uEnvMix 0 → A, 1 → B)
  const tmpRay = new THREE.Vector3(), hit = new THREE.Vector3(), last = new THREE.Vector3(1e9, 0, 0);
  let lastDrop = -10;
  // un reflejo nuevo se dibuja de a UNA cara por cuadro (6 cuadros): ningún cuadro carga con todo
  const job = { on: false, back: 0, face: 0, prepare: null, done: null };
  const faceCams = cubeCam.children;

  return {
    mesh,
    uniforms,
    cubes,
    /**
     * Dibuja el cielo en el cubo de atrás, todo junto (solo al cargar). `prepare` deja los uniforms del cielo
     * y las nubes como deben verse en el reflejo. Devuelve cuál cubo es (0/1).
     */
    renderReflection(prepare) {
      const back = 1 - front;
      prepare?.();
      cubeCam.renderTarget = cubes[back];
      cubeCam.update(renderer, scene);
      return back;
    },
    /** Empieza un reflejo nuevo de a una cara por cuadro; `done(cubo)` al terminar la sexta. */
    startReflection(prepare, done) {
      job.on = true; job.back = 1 - front; job.face = 0; job.prepare = prepare; job.done = done;
    },
    /** Dibuja la próxima cara pendiente (se llama una vez por cuadro, antes de aplicar lo que se ve). */
    stepReflection() {
      if (!job.on) return;
      job.prepare?.();
      const prev = renderer.getRenderTarget();
      cubeCam.updateMatrixWorld(true);
      renderer.setRenderTarget(cubes[job.back], job.face);
      renderer.render(scene, faceCams[job.face]);
      renderer.setRenderTarget(prev);
      if (++job.face >= 6) { job.on = false; job.done?.(job.back); }
    },
    /** Hace que el agua muestre el cubo `i` (con mix animado desde afuera). */
    setFront(i) { front = i; },
    get front() { return front; },
    drop(x, z, s, time) { rip[ripIdx].set(x, z, time, s); ripIdx = (ripIdx + 1) % MAX_RIPPLES; },
    /** El puntero deja ondas donde su rayo toca el agua. */
    pointerRipple(px, py, time) {
      if (uniforms.uRipOn.value < 0.5 || !mesh.visible) return;
      tmpRay.set(px, py, 0.5).unproject(camera).sub(camera.position).normalize();
      if (tmpRay.y > -0.01) return;
      const t = (mesh.position.y - camera.position.y) / tmpRay.y;
      hit.copy(camera.position).addScaledVector(tmpRay, t);
      if (hit.z < -40 || hit.z > camera.position.z) return;
      if (hit.distanceTo(last) > 0.7 && time - lastDrop > 0.11) { this.drop(hit.x, hit.z, 0.9, time); last.copy(hit); lastDrop = time; }
    },
    /** La caída: el mar baja (y) y se agranda para que su borde no se vea desde arriba. */
    setAltitude(y, scale) { mesh.position.y = y; mesh.scale.set(scale, 1, scale); },
    setQuality(t) { uniforms.uWaves.value = t === 'low' ? 0 : 1; uniforms.uRipOn.value = t === 'low' ? 0 : 1; },
  };
}
