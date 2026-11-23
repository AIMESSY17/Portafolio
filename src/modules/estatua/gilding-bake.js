// Cálculos por vértice del modelo, SIN Three.js (corre en un worker: gilding.worker.js).
//  1) normales (promedio por área de las caras)
//  2) suavizado de normales "bilateral": cada normal se promedia con las de sus vecinos PARECIDAS
//     (menos de ~20° de diferencia). Así se van las irregularidades finas del escaneo, que de cerca y en
//     cromo se notan mucho, pero los pliegues marcados (bordes de más de ~30°) quedan nítidos.
//  3) aStatue: posición en "espacio estatua" (m, y = 0 en la base) y aCurv: curvatura (dorado, gilding.js)
// Todo con arrays planos: 90 mil vértices en ~60 ms fuera del hilo principal.

/** pos: Float32Array (xyz) · index: Uint32Array|Uint16Array · toStatue: 16 números (matriz columna) */
export function bake({ pos, index, toStatue, smooth = { passes: 3, sigma: 0.075 } }) {
  const n = pos.length / 3;
  const tris = index ? index.length / 3 : n / 3;
  const I = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);

  // 1) normales por área
  const nor = new Float32Array(n * 3);
  for (let t = 0; t < tris; t++) {
    const a = I(t, 0), b = I(t, 1), c = I(t, 2);
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
  }
  normalizeAll(nor, n);

  // 2) suavizado bilateral
  if (index && smooth.passes > 0) {
    let cur = nor, next = new Float32Array(n * 3);
    const inv = 1 / smooth.sigma;
    for (let pass = 0; pass < smooth.passes; pass++) {
      next.set(cur); // peso propio = 1
      for (let t = 0; t < tris; t++) {
        const a = I(t, 0), b = I(t, 1), c = I(t, 2);
        mixPair(cur, next, a, b, inv); mixPair(cur, next, b, c, inv); mixPair(cur, next, c, a, inv);
      }
      normalizeAll(next, n);
      const tmp = cur; cur = next; next = tmp;
    }
    if (cur !== nor) nor.set(cur);
  }

  // 3) espacio estatua + curvatura
  const m = toStatue;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    p[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    p[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    p[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  const nm = normalMatrix(m);
  const nn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2];
    nn[i * 3] = nm[0] * x + nm[3] * y + nm[6] * z;
    nn[i * 3 + 1] = nm[1] * x + nm[4] * y + nm[7] * z;
    nn[i * 3 + 2] = nm[2] * x + nm[5] * y + nm[8] * z;
  }
  normalizeAll(nn, n);
  const sum = new Float32Array(n * 3), cnt = new Float32Array(n), edge = new Float32Array(n);
  const link = (a, b) => {
    const dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1], dz = p[b * 3 + 2] - p[a * 3 + 2];
    sum[a * 3] += dx; sum[a * 3 + 1] += dy; sum[a * 3 + 2] += dz;
    edge[a] += Math.sqrt(dx * dx + dy * dy + dz * dz);
    cnt[a]++;
  };
  for (let t = 0; t < tris; t++) {
    const a = I(t, 0), b = I(t, 1), c = I(t, 2);
    link(a, b); link(a, c); link(b, a); link(b, c); link(c, a); link(c, b);
  }
  let curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) continue;
    const k = 1 / cnt[i];
    const d = (sum[i * 3] * nn[i * 3] + sum[i * 3 + 1] * nn[i * 3 + 1] + sum[i * 3 + 2] * nn[i * 3 + 2]) * k;
    curv[i] = d / Math.max(1e-5, edge[i] * k);
  }
  for (let pass = 0; pass < 2; pass++) { // que el oro no salga "granulado"
    const acc = new Float32Array(n), c2 = new Float32Array(n);
    for (let t = 0; t < tris; t++) {
      const a = I(t, 0), b = I(t, 1), c = I(t, 2);
      acc[a] += curv[b] + curv[c]; acc[b] += curv[a] + curv[c]; acc[c] += curv[a] + curv[b];
      c2[a] += 2; c2[b] += 2; c2[c] += 2;
    }
    const nx = new Float32Array(n);
    for (let i = 0; i < n; i++) nx[i] = c2[i] ? (curv[i] + acc[i] / c2[i]) * 0.5 : curv[i];
    curv = nx;
  }
  return { normal: nor, aStatue: p, aCurv: curv };
}

function mixPair(cur, out, a, b, inv) {
  const d = cur[a * 3] * cur[b * 3] + cur[a * 3 + 1] * cur[b * 3 + 1] + cur[a * 3 + 2] * cur[b * 3 + 2];
  const q = (1 - d) * inv;
  const w = Math.exp(-q * q);
  if (w < 0.01) return;
  out[a * 3] += cur[b * 3] * w; out[a * 3 + 1] += cur[b * 3 + 1] * w; out[a * 3 + 2] += cur[b * 3 + 2] * w;
  out[b * 3] += cur[a * 3] * w; out[b * 3 + 1] += cur[a * 3 + 1] * w; out[b * 3 + 2] += cur[a * 3 + 2] * w;
}
function normalizeAll(v, n) {
  for (let i = 0; i < n; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    v[i * 3] = x / l; v[i * 3 + 1] = y / l; v[i * 3 + 2] = z / l;
  }
}
// matriz normal (inversa traspuesta de la 3x3) de una matriz 4x4 en orden columna; sale en orden columna
function normalMatrix(m) {
  // M = [[a d g], [b e h], [c f i]]
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const C00 = e * i - h * f, C01 = -(b * i - h * c), C02 = b * f - e * c;
  const C10 = -(d * i - g * f), C11 = a * i - g * c, C12 = -(a * f - d * c);
  const C20 = d * h - g * e, C21 = -(a * h - g * b), C22 = a * e - d * b;
  const det = a * C00 + d * C01 + g * C02 || 1;
  // N = cofactores / det; en orden columna: [N00, N10, N20, N01, N11, N21, N02, N12, N22]
  return [C00 / det, C10 / det, C20 / det, C01 / det, C11 / det, C21 / det, C02 / det, C12 / det, C22 / det];
}
