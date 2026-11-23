// Templo escaneado: una columnata en semicírculo detrás de la estatua, hecha de puntos como un escáner láser.
// Un haz recorre las columnas de abajo hacia arriba y las va "revelando". Se apoya en el piso de obsidiana
// (que la refleja). Está lejos (radio 13+), fuera del cilindro de la estatua.
import { FLOOR_Y } from './obsidiana.js';

export async function createTemplo(ctx, { track }) {
  const { THREE, root, renderer, assetsPath: A } = ctx;
  const buf = await (await fetch(A + 'claroscuro/columna-puntos.bin')).arrayBuffer();
  const q = new Int16Array(buf);
  const N = q.length / 3;
  const H = 9.6;   // alto de cada columna (m)

  // columnas: dos anillos en semicírculo detrás
  const placements = [];
  [[13.5, 9, 1.0], [18.5, 11, 0.7]].forEach(([r, n, s]) => {
    for (let i = 0; i < n; i++) {
      const a = -1.25 + (2.5 * i) / (n - 1);              // de -72° a +72° alrededor del fondo
      placements.push([Math.sin(a) * r, Math.cos(a) * -r, s]);
    }
  });
  const perCol = Math.min(N, 14000);
  let seed = 99;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const beamPts = 260;     // puntos por tramo de dintel
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
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(rr.subarray(0, k), 1));
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

  let sweep = 0;
  return {
    /** Lanza un barrido completo (al cambiar de sección). */
    sweep() { sweep = 0; },
    update(time, delta, state, snap, reduced) {
      u.uTime.value = time;
      sweep = reduced ? 1 : sweep + delta / 4.5;
      u.uScanY.value = FLOOR_Y - 1 + ((sweep % 1.6) / 1.6) * (H * 1.2 + 2);
      u.uHot.value.lerp(state.sun, snap ? 1 : Math.min(1, delta * 2));
      const want = state.scan > 0.5 ? 0.25 : 1;
      u.uOpacity.value += (want - u.uOpacity.value) * (snap ? 1 : Math.min(1, delta * 2));
    },
    resize() { u.uPR.value = renderer.getPixelRatio(); },
  };
}
