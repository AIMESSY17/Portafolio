// ============================================================
//  Dorado sobre mármol marfil (todo procedural, sin texturas)
//
//  1) En JS, al cargar el modelo, se calculan dos datos por vértice:
//     - aStatue: posición en el "espacio de la estatua" (metros, y = 0 en la base,
//       sin el giro de presentación). Sirve para ubicar zonas: alas, base, cuello, cinturón.
//     - aCurv: curvatura. Negativo = arista/cresta (convexo), positivo = hueco.
//       Las crestas de las plumas y los pliegues se doran; los huecos quedan en mármol.
//  2) En el shader se arma una máscara de oro y se mezcla color, metal y rugosidad.
// ============================================================

/** Agrega aStatue y aCurv a la geometría. `toStatue` = matriz geometría → espacio estatua. */
export function bakeGildingAttributes(THREE, geometry, toStatue) {
  const pos = geometry.attributes.position;
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toStatue);
    p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
  }
  geometry.setAttribute('aStatue', new THREE.BufferAttribute(p, 3));

  // normales en espacio estatua (para medir la curvatura)
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nor = geometry.attributes.normal;
  const nm = new THREE.Matrix3().getNormalMatrix(toStatue);
  const nn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    nn[i * 3] = v.x; nn[i * 3 + 1] = v.y; nn[i * 3 + 2] = v.z;
  }

  // curvatura por Laplaciano: (promedio de vecinos - vértice) · normal / largo de arista
  const idx = geometry.index ? geometry.index.array : null;
  const sum = new Float32Array(n * 3);
  const cnt = new Float32Array(n);
  const edge = new Float32Array(n);
  const triCount = idx ? idx.length / 3 : n / 3;
  const link = (a, b) => {
    const dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1], dz = p[b * 3 + 2] - p[a * 3 + 2];
    sum[a * 3] += dx; sum[a * 3 + 1] += dy; sum[a * 3 + 2] += dz;
    edge[a] += Math.sqrt(dx * dx + dy * dy + dz * dz);
    cnt[a]++;
  };
  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    link(a, b); link(a, c); link(b, a); link(b, c); link(c, a); link(c, b);
  }
  let curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) continue;
    const k = 1 / cnt[i];
    const d = (sum[i * 3] * nn[i * 3] + sum[i * 3 + 1] * nn[i * 3 + 1] + sum[i * 3 + 2] * nn[i * 3 + 2]) * k;
    curv[i] = d / Math.max(1e-5, edge[i] * k);
  }
  // dos pasadas de suavizado para que el oro no salga "granulado"
  for (let pass = 0; pass < 2; pass++) {
    const acc = new Float32Array(n), c2 = new Float32Array(n);
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      acc[a] += curv[b] + curv[c]; acc[b] += curv[a] + curv[c]; acc[c] += curv[a] + curv[b];
      c2[a] += 2; c2[b] += 2; c2[c] += 2;
    }
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) next[i] = c2[i] ? (curv[i] + acc[i] / c2[i]) * 0.5 : curv[i];
    curv = next;
  }
  geometry.setAttribute('aCurv', new THREE.BufferAttribute(curv, 1));
}

/** Uniforms del dorado a partir de la config. */
export function gildingUniforms(THREE, g) {
  return {
    uGold: { value: new THREE.Color(g.color) },
    uGoldHi: { value: new THREE.Color(g.highlight) },
    uGoldAmount: { value: g.amount },
    uTorso: { value: new THREE.Vector2(...g.torsoAxis) },
    uWing: { value: new THREE.Vector3(g.wing.radius, g.wing.startY, g.wing.tipFrom) },
    uWingRidge: { value: g.wing.ridge },
    uBase: { value: new THREE.Vector3(g.base.top, g.base.trim, g.base.bottom) },
    uNeck: { value: new THREE.Vector2(g.neck.y, g.neck.radius) },
    uBelt: { value: new THREE.Vector2(g.belt.y, g.belt.width) },
    uDrapery: { value: g.drapery },
    uKintsugi: { value: g.kintsugi },
    uGoldDebug: { value: 0 },
  };
}

// ---------- GLSL ----------
export const GILDING_VERTEX_PARS = /* glsl */ `
attribute vec3 aStatue;
attribute float aCurv;
varying vec3 vS;
varying float vCurv;
`;
export const GILDING_VERTEX = /* glsl */ `
vS = aStatue;
vCurv = aCurv;
`;

export const GILDING_FRAGMENT_PARS = /* glsl */ `
varying vec3 vS;
varying float vCurv;
uniform vec3 uGold, uGoldHi;
uniform float uGoldAmount, uWingRidge, uDrapery, uKintsugi, uGoldDebug;
uniform vec2 uTorso, uNeck, uBelt;
uniform vec3 uWing, uBase;
float gGold = 0.0;

float goldMask(vec3 s, float curv, float n1, float n2) {
  float r = length(s.xz - uTorso);           // distancia al eje del torso
  float ridge = smoothstep(-0.05, -0.32, curv); // crestas (convexo)

  // ALAS: crestas de las plumas doradas + puntas bañadas en oro (borde irregular)
  float wing = smoothstep(uWing.x, uWing.x + 0.14, r) * smoothstep(uWing.y, uWing.y + 0.3, s.y);
  float tip = smoothstep(uWing.z, uWing.z + 0.22, r + n1 * 0.12);
  float wingGold = wing * max(ridge * uWingRidge, tip);

  // BASE: dos filetes dorados que enmarcan el bloque del pedestal (arriba y abajo)
  float trimTop = smoothstep(uBase.y, 0.0, abs(s.y - uBase.x + 0.015));
  float trimBottom = smoothstep(uBase.y, 0.0, abs(s.y - uBase.z));
  float baseGold = max(trimTop, trimBottom) * (1.0 - wing);

  // CUELLO: corte del cuello cubierto en oro, como un collar
  float neck = smoothstep(uNeck.x - 0.06, uNeck.x + 0.02, s.y) * (1.0 - smoothstep(uNeck.y, uNeck.y + 0.08, r));

  // CINTURÓN bajo el pecho: una cinta dorada que sigue los pliegues
  float belt = (1.0 - smoothstep(uBelt.y * 0.5, uBelt.y * 0.5 + 0.02, abs(s.y - uBelt.x + n2 * 0.03)))
             * (1.0 - wing) * (1.0 - smoothstep(0.42, 0.5, r));

  // PLIEGUES: toques de pan de oro solo en las crestas más marcadas del manto
  float drape = (1.0 - wing) * smoothstep(-0.28, -0.5, curv) * smoothstep(0.55, 0.75, n2) * uDrapery
              * step(uBase.x + 0.05, s.y);

  // KINTSUGI: grietas finas rellenas de oro que recorren el mármol
  float crack = 1.0 - smoothstep(0.0, 0.012, abs(n1 - 0.5) - 0.0);
  crack *= smoothstep(0.45, 0.62, n2) * uKintsugi;

  return clamp(max(max(max(wingGold, baseGold), max(neck, belt)), max(drape, crack)), 0.0, 1.0) * uGoldAmount;
}
`;

// se inserta después de <color_fragment> (ya existe mFbm del mármol)
export const GILDING_COLOR = /* glsl */ `
{
  vec3 gs = vS * 1.35;
  float n1 = mFbm(gs * 1.6 + 11.0);
  float n2 = mFbm(gs * 0.9 - 3.0);
  gGold = goldMask(vS, vCurv, n1, n2);
  // oro con leve variación (martillado) entre Oro y Oro brillo
  vec3 goldCol = mix(uGold, uGoldHi, smoothstep(0.35, 0.75, mFbm(vS * 9.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, goldCol, gGold);
  if (uGoldDebug > 0.5) diffuseColor.rgb = mix(vec3(0.2), vec3(1.0, 0.1, 0.0), gGold);
}
`;

// se inserta después de <metalnessmap_fragment> y <roughnessmap_fragment>
export const GILDING_PBR = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 1.0, gGold);
roughnessFactor = mix(roughnessFactor, 0.2, gGold);
`;
