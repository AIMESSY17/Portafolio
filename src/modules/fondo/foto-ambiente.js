// Luz y reflejos con los HDR reales (Poly Haven, 1K): lo que ilumina y reflejan la estatua, el cromo y los
// marcos. Cada entorno se hornea UNA vez al cargar (PMREM) desde una escena mínima:
//   · el HDR, girado igual que su panorama (el sol cae en el mismo lugar), con toda su luz (el sol del HDR
//     es mucho más fuerte que el de la foto: de ahí salen los brillos del cromo)
//   · abajo, para el atardecer y la noche, un MAR analítico: agua oscura que refleja ese mismo cielo según
//     el ángulo (Fresnel). Así el cromo refleja el mar y el camino de sol, no la niebla de la foto
//   · a la noche, el cielo oscurecido y la Vía Láctea
// Además: el sol (direccional) en la dirección del sol de la foto y una luz de cielo suave.
// El cambio de entorno se hace en momentos tapados (adentro de la nube) o con una bajada corta de intensidad.
import { gsap } from 'gsap';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { PANOS, panoOffset } from './foto-cielo.js';

const ENV_VERTEX = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ENV_FRAGMENT = /* glsl */`
uniform sampler2D uHdr, uVia;
uniform float uOff, uExpo, uSea, uNight, uVia1;
uniform vec3 uSeaDeep;
uniform mat3 uViaM;
varying vec3 vDir;
const float PI2 = 6.28318530718;
vec3 sky(vec3 d){
  float u = fract(atan(d.z, d.x) / PI2 + 0.5 - uOff);
  float v = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5;
  vec3 c = texture2D(uHdr, vec2(u, v)).rgb * uExpo;
  if (uNight > 0.0) {
    float up = clamp(d.y, 0.0, 1.0);
    c *= mix(1.0, mix(0.5, 0.12, pow(up, 0.55)), uNight);
    if (uVia1 > 0.0 && d.y > 0.0) {
      vec3 g = uViaM * d;
      vec2 vu = vec2(atan(g.x, -g.z) / PI2 + 0.5, 0.5 + asin(clamp(g.y, -1.0, 1.0)) / 3.14159265);
      vec3 via = texture2D(uVia, vu).rgb;
      c += via * via * uVia1 * smoothstep(0.0, 0.25, d.y);
    }
  }
  return c;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 col;
  if (uSea > 0.5 && d.y < 0.0) {
    // mar: agua oscura que refleja el cielo (más cuanto más rasante)
    vec3 r = vec3(d.x, -d.y, d.z);
    float fres = 0.02 + 0.98 * pow(1.0 - (-d.y), 5.0);
    col = mix(uSeaDeep, sky(r), fres);
  } else {
    col = sky(d);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function createFotoAmbiente(ctx, { track, onProgress, viaMatrix }) {
  const { THREE, root, renderer, scene, assetsPath: A } = ctx;
  const sun = new THREE.DirectionalLight('#ffe5ba', 2.6);
  sun.name = 'luz_sol';
  sun.target.position.set(0, 1.5, 0);
  const hemi = new THREE.HemisphereLight('#d9e7f0', '#f1e2cc', 0.4);
  hemi.name = 'luz_cielo_hemisferica';
  root.add(sun, sun.target, hemi);

  const envs = {};
  const loader = new RGBELoader();
  loader.setDataType(THREE.HalfFloatType);
  let n = 0;

  // escena mínima para hornear
  const envU = {
    uHdr: { value: null }, uVia: { value: null }, uOff: { value: 0 }, uExpo: { value: 1 }, uSea: { value: 0 },
    uNight: { value: 0 }, uVia1: { value: 0 }, uSeaDeep: { value: new THREE.Color('#0d0c12') }, uViaM: { value: new THREE.Matrix3() },
  };
  const envScene = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({ uniforms: envU, vertexShader: ENV_VERTEX, fragmentShader: ENV_FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const envGeo = new THREE.SphereGeometry(10, 64, 32);
  envScene.add(new THREE.Mesh(envGeo, envMat));
  // cómo se hornea cada uno: qué HDR, cuánta luz, si lleva mar abajo y si es de noche
  const RECETAS = {
    dia: { pano: 'dia', expo: 1, sea: 0, night: 0, via: 0, deep: '#20293a' },
    atardecer: { pano: 'atardecer', expo: 1, sea: 1, night: 0, via: 0, deep: '#0c0b12' },
    noche: { pano: 'crepusculo', expo: 0.55, sea: 1, night: 1, via: 0.9, deep: '#05070d' },
  };

  async function bakeAll(viaTexture) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
    envScene.add(cubeCam);
    const hdrs = {};
    for (const name of Object.keys(PANOS)) {
      try {
        const tex = await loader.loadAsync(`${A}cielo/${PANOS[name].hdr}`);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = THREE.RepeatWrapping;
        hdrs[name] = tex;
      } catch (e) {
        console.warn('[fondo] no se pudo cargar el HDR', PANOS[name].hdr, e);
      }
      onProgress?.(++n / 3);
    }
    envU.uVia.value = viaTexture;
    if (viaMatrix) envU.uViaM.value.copy(viaMatrix);
    for (const [name, r] of Object.entries(RECETAS)) {
      const tex = hdrs[r.pano];
      if (!tex) continue;
      envU.uHdr.value = tex;
      envU.uOff.value = panoOffset(PANOS[r.pano]);
      envU.uExpo.value = r.expo;
      envU.uSea.value = r.sea;
      envU.uNight.value = r.night;
      envU.uVia1.value = viaTexture ? r.via : 0;
      envU.uSeaDeep.value.set(r.deep);
      cubeCam.update(renderer, envScene);
      envs[name] = track(pmrem.fromCubemap(cubeRT.texture));
    }
    Object.values(hdrs).forEach((t) => t.dispose());
    cubeRT.dispose();
    pmrem.dispose();
    envGeo.dispose();
    envMat.dispose();
  }

  let active = null, wanted = null;
  const dip = { v: 1 };
  let dipTl = null;
  function swapNow(name) { if (!envs[name]) return; active = name; scene.environment = envs[name].texture; }

  return {
    sun, hemi, envs,
    bakeAll,
    /** Pide un entorno. instant = cambio directo (tapado por la nube o al cargar). */
    use(name, instant = false) {
      if (!envs[name] || wanted === name) return;
      wanted = name;
      if (instant || active === null) { dipTl?.kill(); dip.v = 1; swapNow(name); return; }
      dipTl?.kill();
      dipTl = gsap.timeline()
        .to(dip, { v: 0.35, duration: 0.4, ease: 'power3.inOut' })
        .add(() => swapNow(wanted))
        .to(dip, { v: 1, duration: 0.4, ease: 'power3.inOut' });
    },
    get active() { return active; },
    apply(st, dir) {
      sun.color.copy(st.sun);
      sun.intensity = st.sunI;
      sun.position.copy(dir).multiplyScalar(30).add(sun.target.position);
      hemi.color.copy(st.hemiSky);
      hemi.groundColor.copy(st.hemiGround);
      hemi.intensity = st.hemiI;
      scene.environmentIntensity = st.envI * dip.v;
    },
    dispose() { dipTl?.kill(); },
  };
}
