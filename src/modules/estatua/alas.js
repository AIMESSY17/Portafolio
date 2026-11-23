// Alas de luz: de las puntas de las alas se desprenden partículas de luz que se lleva el viento.
//  · nacen en puntos reales de las alas (del modelo liviano, en "espacio estatua"), con la pose que tiene
//    la estatua EN ESE MOMENTO: si se la gira arrastrando, las que ya salieron se quedan atrás y las
//    nuevas salen revoleadas por el giro. Arrastrando salen más.
//  · el movimiento, el ciclo de vida (blanca → dorada → ámbar → se apaga) y la iridiscencia leve
//    (dorado → rosado → celeste según el ángulo con el sol) se calculan en el shader.
//  · un solo buffer en anillo: cada cuadro se escriben solo las que nacen (unas decenas) y se suben
//    solo esos tramos (addUpdateRange). No se crea nada en update. Están en la capa del bloom.
import { ALAS, GOLD, STATUE } from './config.js';

const VERTEX = /* glsl */`
attribute vec3 aVel;
attribute float aBirth;
attribute float aSeed;
uniform float uTime, uLife, uScale, uWindK, uSize;
uniform vec3 uWind, uSunDir;
varying float vAge;
varying float vSeed;
varying float vFacing;
void main(){
  float life = uLife * (0.65 + 0.7 * aSeed);
  float t = uTime - aBirth;
  float age = t / life;
  vAge = age; vSeed = aSeed; vFacing = 0.0;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec3 p = position + aVel * t + uWind * (uWindK * t * t * 0.5);
  float sw = t * 0.9 + aSeed * 30.0;                          // se ondulan como pelo en el viento
  p += vec3(sin(sw * 1.7), sin(sw * 1.3) * 0.6, cos(sw * 1.5)) * 0.07 * t;
  p.y += 0.035 * t * t;                                        // la luz sube apenas
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = uSize * (0.45 + 0.9 * fract(aSeed * 7.31)) * (1.0 - age * 0.5);
  gl_PointSize = clamp(s * uScale / -mv.z, 1.0, 40.0);
  vFacing = dot(normalize(cameraPosition - p), uSunDir);
}`;

const FRAGMENT = /* glsl */`
uniform vec3 uWhite, uGold, uAmber, uDeep, uIriA, uIriB, uIriC;
uniform float uIri, uGlow, uNight, uOver, uBloomPass, uBloomK;
varying float vAge;
varying float vSeed;
varying float vFacing;
vec3 iri(float x){
  x = fract(x);
  if (x < 0.3333) return mix(uIriA, uIriB, x * 3.0);
  if (x < 0.6666) return mix(uIriB, uIriC, (x - 0.3333) * 3.0);
  return mix(uIriC, uIriA, (x - 0.6666) * 3.0);
}
void main(){
  if (vAge < 0.0 || vAge > 1.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  float a = exp(-d2 * 48.0) * 0.9 + exp(-d2 * 12.0) * 0.16;   // punto nítido con un halo corto
  if (fract(vSeed * 19.3) > 0.9) {                             // algunas destellan en cruz
    a += (exp(-abs(c.y) * 60.0) * (1.0 - smoothstep(0.0, 0.5, abs(c.x))) + exp(-abs(c.x) * 60.0) * (1.0 - smoothstep(0.0, 0.5, abs(c.y)))) * 0.5;
  }
  // ciclo de vida: blanca → dorada → ámbar → se apaga
  vec3 col = vAge < 0.07 ? mix(uWhite, uGold, vAge / 0.07)
           : vAge < 0.45 ? mix(uGold, uAmber, (vAge - 0.07) / 0.38)
           : mix(uAmber, uDeep, (vAge - 0.45) / 0.55);
  col = mix(col, uWhite * 0.9 + uGold * 0.1, uNight * 0.5);    // de noche, más blanca
  // iridiscencia leve, según el ángulo con el sol
  vec3 tint = iri(vSeed * 2.0 + vFacing * 0.9 + vAge * 0.6);
  col = mix(col, col * 0.5 + tint * 0.7, uIri * smoothstep(0.06, 0.3, vAge));
  float fade = smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge));
  a = min(a * fade * uGlow * (1.0 - uOver * 0.3), 1.0);        // pintadas encima: más livianas (no se amontonan)
  if (uBloomPass > 0.5) a *= uBloomK;                          // en el bloom brillan menos: puntos, no un halo
  if (a < 0.003) discard;
  // alfa premultiplicado: uOver = 1 se pinta encima (se ve sobre el cielo claro), 0 = luz que se suma
  col *= 1.0 - uOver * 0.18;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * uOver);
}`;

export function createAlas(ctx, { statue }) {
  const { THREE, root, camera, renderer, shared } = ctx;
  const N = ALAS.count.high;
  let active = ALAS.count[ctx.quality] ?? ALAS.count.medium;
  const spawn = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const birth = new Float32Array(N).fill(-1e4);
  const seeds = new Float32Array(N);
  let seed = 9001;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) seeds[i] = rand();

  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(spawn, 3).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage);
  const aBirth = new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aVel', aVel);
  geo.setAttribute('aBirth', aBirth);
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setDrawRange(0, active);

  const C = ALAS.colors;
  const uniforms = {
    uTime: { value: 0 }, uLife: { value: ALAS.life }, uScale: { value: 600 }, uWindK: { value: ALAS.wind }, uSize: { value: ALAS.size },
    uWind: { value: new THREE.Vector3(-0.93, 0.22, -0.3) }, uSunDir: { value: new THREE.Vector3(0.5, 0.5, -0.7) },
    uWhite: { value: new THREE.Color(C.white) }, uGold: { value: new THREE.Color(C.gold) }, uAmber: { value: new THREE.Color(C.amber) },
    uDeep: { value: new THREE.Color(C.deep) }, uIriA: { value: new THREE.Color(C.iriA) }, uIriB: { value: new THREE.Color(C.iriB) },
    uIriC: { value: new THREE.Color(C.iriC) }, uIri: { value: ALAS.iridescence }, uGlow: { value: 1 }, uNight: { value: 0 },
    uOver: { value: 0.8 }, uBloomPass: { value: 0 }, uBloomK: { value: 0.25 },
  };
  // mezcla premultiplicada: entre "pintada encima" y "luz que se suma", sin cambiar de material
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  material.userData.bloomUniform = uniforms.uBloomPass; // el core lo prende durante la pasada de bloom
  const points = new THREE.Points(geo, material);
  points.name = 'estatua_alas_de_luz';
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.layers.enable(1); // bloom
  root.add(points);

  // ---------- de dónde nacen: puntas y bordes de arriba de las alas (espacio estatua) ----------
  let emit = null, emitCount = 0;
  function buildEmitters(geometry) {
    const S = geometry?.attributes?.aStatue;
    if (!S) return;
    const [ax, az] = GOLD.torsoAxis;
    const cand = [];
    for (let i = 0; i < S.count; i++) {
      const x = S.getX(i), y = S.getY(i), z = S.getZ(i);
      const r = Math.hypot(x - ax, z - az);
      if (r < ALAS.emit.minR || y < ALAS.emit.minY) continue;
      cand.push({ i, score: r + y * 0.35 });
    }
    cand.sort((a, b) => b.score - a.score);
    const take = Math.min(ALAS.emit.take, cand.length);
    emit = new Float32Array(take * 3);
    for (let k = 0; k < take; k++) {
      const i = cand[k].i;
      emit[k * 3] = S.getX(i); emit[k * 3 + 1] = S.getY(i); emit[k * 3 + 2] = S.getZ(i);
    }
    emitCount = take;
  }

  // ---------- emisión ----------
  const toWorld = new THREE.Matrix4();
  const presentRot = new THREE.Matrix4().makeRotationY(STATUE.rotationY);
  const p = new THREE.Vector3(), axis = new THREE.Vector3(), radial = new THREE.Vector3();
  let head = 0, acc = 0;
  const _size = new THREE.Vector2();

  function markRange(start, count) {
    aPos.addUpdateRange(start * 3, count * 3);
    aVel.addUpdateRange(start * 3, count * 3);
    aBirth.addUpdateRange(start, count);
  }

  return {
    points,
    uniforms,
    buildEmitters,
    get ready() { return emitCount > 0; },
    resize() {
      const h = renderer.getDrawingBufferSize(_size).y;
      uniforms.uScale.value = camera.projectionMatrix.elements[5] * h * 0.5;
    },
    setQuality(t) {
      active = ALAS.count[t] ?? ALAS.count.medium;
      head %= active;
      geo.setDrawRange(0, active);
      this.resize();
    },
    /** spinVel = velocidad angular de la estatua (rad/s), dragging = la están girando, amount = 0..1 */
    update(time, dt, { spinVel = 0, dragging = false, amount = 1, reduced = false, over = 0.8, glow = 1 } = {}) {
      uniforms.uTime.value = time;
      uniforms.uOver.value = over;
      uniforms.uGlow.value = glow;
      if (shared.sol) uniforms.uSunDir.value.copy(shared.sol.dir);
      uniforms.uNight.value = shared.sol?.noche ?? 0;
      const w = shared.wind;
      uniforms.uWind.value.set(w.x, w.y, w.z).multiplyScalar(0.5 + w.strength);
      if (!emitCount || amount <= 0.001) return;

      // cuántas nacen: en reposo una parte; arrastrando, todas
      const drag = Math.min(1, Math.abs(spinVel) / 2.2 + (dragging ? 0.35 : 0));
      const alive = ALAS.rest + (ALAS.dragBoost - ALAS.rest) * drag;
      const rate = (active * alive) / ALAS.life * amount * (reduced ? 0.12 : 1);
      acc += rate * dt;
      let n = Math.min(Math.floor(acc), 220);
      acc -= n;
      if (n <= 0) return;

      // pose de la estatua AHORA: espacio estatua → mundo
      statue.floatGroup.updateWorldMatrix(true, false);
      toWorld.multiplyMatrices(statue.floatGroup.matrixWorld, presentRot);
      axis.set(GOLD.torsoAxis[0], 1.5, GOLD.torsoAxis[1]).applyMatrix4(toWorld); // eje del torso (mundo)
      const start = head;
      for (let k = 0; k < n; k++) {
        const e = Math.floor(rand() * emitCount) * 3;
        p.set(emit[e], emit[e + 1], emit[e + 2]).applyMatrix4(toWorld);
        const i = head;
        spawn[i * 3] = p.x; spawn[i * 3 + 1] = p.y; spawn[i * 3 + 2] = p.z;
        // hacia afuera del cuerpo + un poco arriba + el revoleo del giro (ω × r)
        radial.set(p.x - axis.x, 0, p.z - axis.z);
        const rl = radial.length() || 1;
        const sp = ALAS.speed * (0.5 + rand());
        const fl = spinVel * ALAS.fling;
        vel[i * 3] = (radial.x / rl) * sp + fl * radial.z + (rand() - 0.5) * 0.06;
        vel[i * 3 + 1] = 0.06 + rand() * 0.1;
        vel[i * 3 + 2] = (radial.z / rl) * sp - fl * radial.x + (rand() - 0.5) * 0.06;
        birth[i] = time - rand() * dt; // repartidas dentro del cuadro: no salen en "pelotones"
        head = (head + 1) % active;
      }
      // subir solo lo que cambió (uno o dos tramos si dio la vuelta al anillo)
      if (start + n <= active) markRange(start, n);
      else { markRange(start, active - start); markRange(0, n - (active - start)); }
      aPos.needsUpdate = true; aVel.needsUpdate = true; aBirth.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
}
