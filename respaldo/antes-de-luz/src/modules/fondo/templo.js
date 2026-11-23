// Templo escaneado: una columnata en semicírculo detrás de la estatua, hecha de puntos como un escáner láser.
// Un haz recorre las columnas de abajo hacia arriba y las va "revelando". Se apoya en el piso de obsidiana
// Está lejos (radio 13.5), fuera del cilindro de la estatua.
// Solo el anillo de adelante: 9 columnas. Puntos por columna: high 4000, medium 2000, low 800.
// Los puntos se guardan mezclados al azar: bajar de calidad es dibujar menos (drawRange) y la
// columnata sigue pareja, sin huecos.
import { FLOOR_Y } from './obsidiana.js';
import { damp } from './ritmo.js';

const PER_COLUMN = { high: 4000, medium: 2000, low: 800 };
const COLUMNS = 9;

export async function createTemplo(ctx, { track, tier }) {
  const { THREE, root, renderer, assetsPath: A } = ctx;
  const buf = await (await fetch(A + 'claroscuro/columna-puntos.bin')).arrayBuffer();
  const q = new Int16Array(buf);
  const N = q.length / 3;
  const H = 9.6;   // alto de cada columna (m)

  // columnas: un anillo en semicírculo detrás
  const placements = [];
  for (let i = 0; i < COLUMNS; i++) {
    const a = -1.25 + (2.5 * i) / (COLUMNS - 1);          // de -72° a +72° alrededor del fondo
    placements.push([Math.sin(a) * 13.5, Math.cos(a) * -13.5, 1.0]);
  }
  const perCol = Math.min(N, PER_COLUMN.high);
  let seed = 99;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const beamPts = 100;     // puntos por tramo de dintel
  const total = placements.length * perCol + (placements.length - 1) * beamPts * 2;
  const pos = new Float32Array(total * 3), rr = new Float32Array(total);
  let k = 0;
  placements.forEach(([x, z, s]) => {
    for (let i = 0; i < perCol; i++) {
      const j = Math.floor(rnd() * N) * 3;
      pos[k * 3] = x + (q[j] / 32767) * H * s;
      pos[k * 3 + 1] = FLOOR_Y + (q[j + 1] / 32767) * H * s;
      pos[k * 3 + 2] = z + (q[j + 2] / 32767) * H * s;
      rr[k++] = rnd();
    }
  });
  // dinteles entre columnas vecinas del mismo anillo
  for (let c = 0; c < placements.length - 1; c++) {
    const a = placements[c], b = placements[c + 1];
    if (a[2] !== b[2]) continue;
    for (let i = 0; i < beamPts * 2; i++) {
      const t = rnd(), top = FLOOR_Y + H * a[2] + (i % 2 ? 0.05 : 0.55) * a[2];
      pos[k * 3] = a[0] + (b[0] - a[0]) * t; pos[k * 3 + 1] = top + (rnd() - 0.5) * 0.08; pos[k * 3 + 2] = a[1] + (b[1] - a[1]) * t;
      rr[k++] = rnd();
    }
  }
  // mezclar: cualquier prefijo de los puntos es una muestra pareja de toda la columnata
  const order = Array.from({ length: k }, (_, i) => i);
  for (let i = k - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const shufPos = new Float32Array(k * 3), shufR = new Float32Array(k);
  order.forEach((from, to) => {
    shufPos[to * 3] = pos[from * 3]; shufPos[to * 3 + 1] = pos[from * 3 + 1]; shufPos[to * 3 + 2] = pos[from * 3 + 2];
    shufR[to] = rr[from];
  });
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(shufPos, 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(shufR, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -14), 30);

  const u = {
    uTime: { value: 0 }, uScanY: { value: -2 }, uColor: { value: new THREE.Color('#BFD4F2') }, uHot: { value: new THREE.Color('#FFB15A') },
    uOpacity: { value: 1 }, uPR: { value: renderer.getPixelRatio() },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float aR; uniform float uTime, uScanY, uPR; varying float vBand; varying float vR; varying float vFar; varying float vBase;
      void main(){
        vec3 p = position;
        float d = p.y - uScanY;
        vBand = exp(-d * d * 6.0);                                   // el haz que recorre
        vR = aR;
        vFar = smoothstep(12.0, 22.0, length(p.xz));
        vBase = smoothstep(-0.7, 1.6, p.y);          // las bases (más densas) no encandilan ni se reflejan de más
        p.x += vBand * (aR - 0.5) * 0.12;                            // el haz "vibra" los puntos
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.6 + vBand * 1.6) * uPR * (16.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uHot; uniform float uOpacity, uTime; uniform float uScanY; varying float vBand; varying float vR; varying float vFar; varying float vBase;
      void main(){
        vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
        float flick = 0.75 + 0.25 * sin(uTime * 3.0 + vR * 80.0);
        float a = (0.15 * flick + vBand * 0.6) * (1.0 - vFar * 0.5) * uOpacity * (0.04 + 0.96 * vBase);
        vec3 col = mix(uColor, uHot, vBand * 0.6);
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  root.add(pts);
  const setQuality = (t) => geo.setDrawRange(0, Math.floor(k * (PER_COLUMN[t] / PER_COLUMN.high)));
  setQuality(tier);

  let sweep = 0;
  return {
    /** Lanza un barrido completo (al cambiar de sección). */
    sweep() { sweep = 0; },
    setQuality,
    update(time, dt, state, snap, reduced) {
      u.uTime.value = time;
      sweep = reduced ? 1 : sweep + dt / 4.5;
      u.uScanY.value = FLOOR_Y - 1 + ((sweep % 1.6) / 1.6) * (H * 1.2 + 2);
      u.uHot.value.lerp(state.sun, snap ? 1 : damp(3, dt));
      const want = (state.scan > 0.5 ? 0.25 : 1) * 0.6 * state.columns; // galería: -40 %; cada sala las baja o las apaga más
      u.uOpacity.value += (want - u.uOpacity.value) * (snap ? 1 : damp(3, dt));
    },
    resize() { u.uPR.value = renderer.getPixelRatio(); },
  };
}
