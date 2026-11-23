// Polvo: miles de partículas que en reposo flotan apenas visibles y, con hover sobre un proyecto,
// se juntan para dibujar su emblema (estrella de tattoo, sol y olas, monitores con REC, huevos, muffin…).
// Toman el color de la luz del mundo de cada proyecto. El cursor las sopla.
// En reposo se dibujan 15.000. Las completas (high 60k, medium 30k, low 10k) aparecen SOLO durante
// el hover y con fundido: las "extra" nacen con opacidad 0 y recién entonces se las dibuja
// (nunca cambia la cantidad de golpe con algo visible).
import { damp } from './ritmo.js';


const PLANE_Z = -10.6;
const DESIGN_WIDTH = 23;
const EMBLEMS = ['tinta-negra', 'mantra-estetica', 'aura-aika', 'zurklima', 'la-pastoril', 'chufas', 'casa-de-muffin'];
const COUNTS = { high: 60000, medium: 30000, low: 10000 }; // completas (hover)
const IDLE = 15000;                                         // en reposo

export function createPolvo(ctx, { track, tier }) {
  const { THREE, root, renderer, camera, assetsPath: A } = ctx;
  let seed = 777;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = COUNTS[tier]; // la calidad solo baja: alcanza con lo del arranque
  let full = N;
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  function idleShape() {
    const pos = new Float32Array(N * 3), lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - 0.5) * 30; pos[i * 3 + 1] = 2.5 + (rnd() - 0.5) * 16; pos[i * 3 + 2] = PLANE_Z - rnd() * 6;
      lum[i] = rnd() * 0.18;
    }
    return { pos, lum };
  }
  async function emblem(id) {
    const img = await loadImage(`${A}polvo/p-${id}.png`);
    const cw = 640, ch = Math.round(cw * img.height / img.width), w = 17, y = 2.9;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch);
    const px = g.getImageData(0, 0, cw, ch).data;
    const cdf = new Float32Array(cw * ch); let acc = 0;
    for (let k = 0; k < cw * ch; k++) { const v = px[k * 4] / 255; acc += v > 0.04 ? v : 0; cdf[k] = acc; }
    const pos = new Float32Array(N * 3), lum = new Float32Array(N), h = w * ch / cw;
    for (let i = 0; i < N; i++) {
      const r = rnd() * acc; let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
      const x = lo % cw, yy = (lo / cw) | 0, v = px[lo * 4] / 255;
      pos[i * 3] = ((x + rnd()) / cw - 0.5) * w; pos[i * 3 + 1] = (0.5 - (yy + rnd()) / ch) * h + y;
      pos[i * 3 + 2] = PLANE_Z + (v - 0.5) * 0.5 + (rnd() - 0.5) * 0.3;
      lum[i] = v;
    }
    return { pos, lum };
  }

  const idle = idleShape();
  const geo = track(new THREE.BufferGeometry());
  const aFrom = new THREE.BufferAttribute(idle.pos.slice(), 3), aTo = new THREE.BufferAttribute(idle.pos.slice(), 3);
  const aLF = new THREE.BufferAttribute(idle.lum.slice(), 1), aLT = new THREE.BufferAttribute(idle.lum.slice(), 1);
  const rands = new Float32Array(N); for (let i = 0; i < N; i++) rands[i] = rnd();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aFrom', aFrom); geo.setAttribute('aTo', aTo); geo.setAttribute('aLumFrom', aLF); geo.setAttribute('aLumTo', aLT);
  geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  geo.setDrawRange(0, Math.min(IDLE, full));

  const u = {
    uBase: { value: Math.min(IDLE, N) }, uExtra: { value: 0 },
    uT: { value: 1 }, uBurst: { value: 0 }, uTime: { value: 0 }, uSize: { value: 44 }, uPR: { value: renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector3(0, -100, -100) }, uAlpha: { value: 0.5 }, uTurb: { value: 0 },
    uC0: { value: new THREE.Color('#5B3A1E') }, uC1: { value: new THREE.Color('#C9A227') }, uC2: { value: new THREE.Color('#F1D27A') },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 aFrom, aTo; attribute float aLumFrom, aLumTo, aRand;
      uniform float uT, uBurst, uTime, uSize, uPR, uTurb, uBase, uExtra; uniform vec3 uMouse;
      varying float vLum; varying float vTw; varying float vEx;
      void main(){
        vEx = float(gl_VertexID) < uBase ? 1.0 : uExtra;   // las partículas extra entran con fundido
        vec3 p = mix(aFrom, aTo, uT);
        vec3 n = vec3(sin(aRand*6.28 + uTime*0.7), cos(fract(aRand*7.31)*6.28 + uTime*0.6), sin(fract(aRand*13.7)*6.28 + uTime*0.5));
        p += n * uBurst * (1.0 + fract(aRand*3.7) * 3.0);
        p += n * (0.03 + uTurb * 0.3);
        vec2 dm = p.xy - uMouse.xy; float push = smoothstep(2.4, 0.0, length(dm));
        p.xy += normalize(dm + 1e-4) * push * 1.3; p.z += push * 0.7;
        vLum = mix(aLumFrom, aLumTo, uT) + push * 0.35;
        vTw = 0.7 + 0.3 * sin(uTime * (2.0 + aRand * 3.0) + aRand * 40.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.5 + clamp(vLum, 0.0, 1.2) * 0.9) / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha; uniform vec3 uC0, uC1, uC2; varying float vLum; varying float vTw; varying float vEx;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        float l = clamp(vLum * vTw, 0.0, 1.0);
        vec3 col = l < 0.5 ? mix(uC0, uC1, l / 0.5) : mix(uC1, mix(uC2, vec3(1.0), 0.25), (l - 0.5) / 0.5);
        float a = smoothstep(0.25, 0.0, d) * (0.25 + 0.75 * l) * uAlpha * vEx;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const group = new THREE.Group(); group.add(pts); root.add(group);

  const shapes = { idle };
  const ready = Promise.all(EMBLEMS.map(async (id) => { try { shapes[id] = await emblem(id); } catch (e) { console.warn('[fondo] emblema', id, e); } }));
  const morph = { t: 1, cur: 'idle', want: 'idle', dur: 1.8 };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function to(key) {
    morph.want = key;
    const s = shapes[key];
    if (!s || morph.cur === key) return;
    const e = ease(morph.t), f = aFrom.array, t = aTo.array, lf = aLF.array, lt = aLT.array;
    for (let i = 0; i < N * 3; i++) f[i] += (t[i] - f[i]) * e;
    for (let i = 0; i < N; i++) lf[i] += (lt[i] - lf[i]) * e;
    t.set(s.pos); lt.set(s.lum);
    aFrom.needsUpdate = aTo.needsUpdate = aLF.needsUpdate = aLT.needsUpdate = true;
    morph.t = 0; morph.cur = key; morph.dur = key === 'idle' ? 1.6 : 1.8;
  }
  ready.then(() => to(morph.want));

  const ray = new THREE.Vector3(), hit = new THREE.Vector3();
  const gold1 = new THREE.Color('#C9A227'), gold2 = new THREE.Color('#F1D27A'), tmp = new THREE.Color();
  return {
    to: (id) => to(id || 'idle'),
    ready,
    setQuality(t) {
      full = Math.min(N, COUNTS[t]); u.uBase.value = Math.min(IDLE, full);
      u.uPR.value = renderer.getPixelRatio(); u.uSize.value = t === 'low' ? 64 : t === 'medium' ? 52 : 44;
    },
    resize() { u.uPR.value = renderer.getPixelRatio(); },
    update(time, delta, state, pointer, hasPointer, turb, snap, reduced) {
      const dt = delta;
      u.uTime.value = reduced ? 0 : time;
      if (morph.t < 1) morph.t = snap ? 1 : Math.min(1, morph.t + dt / morph.dur);
      const e = ease(morph.t);
      u.uT.value = e; u.uBurst.value = reduced ? 0 : Math.sin(Math.PI * e) * 0.9;
      u.uTurb.value = reduced ? 0 : turb;
      const k = snap ? 1 : damp(3.5, dt);
      // partículas extra: se funden dentro durante el hover y fuera al volver a reposo
      const wantExtra = morph.cur === 'idle' ? 0 : 1;
      u.uExtra.value += (wantExtra - u.uExtra.value) * (snap ? 1 : damp(4, dt));
      if (Math.abs(wantExtra - u.uExtra.value) < 0.004) u.uExtra.value = wantExtra;
      geo.setDrawRange(0, wantExtra || u.uExtra.value > 0 ? full : Math.min(IDLE, full));
      u.uAlpha.value += ((morph.cur === 'idle' ? 0.45 : 1) - u.uAlpha.value) * k;
      // el polvo toma el color de la luz del mundo del proyecto
      u.uC1.value.lerp(tmp.copy(gold1).lerp(state.sun, 0.55), k);
      u.uC2.value.lerp(tmp.copy(gold2).lerp(state.sun, 0.45), k);
      // tamaño según pantalla
      const dist = camera.position.z - PLANE_Z;
      const visW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      const s = Math.min(1, Math.max(0.38, (visW * 0.96) / DESIGN_WIDTH));
      group.scale.setScalar(s); group.position.set(0, (1 - s) * 1.6, (1 - s) * PLANE_Z);
      // el cursor sopla
      if (hasPointer) {
        ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = (PLANE_Z * s + group.position.z - camera.position.z) / ray.z;
        hit.copy(camera.position).addScaledVector(ray, t); group.worldToLocal(hit);
      } else hit.set(0, -100, -100);
      u.uMouse.value.lerp(hit, damp(8, dt));
    },
  };
}
