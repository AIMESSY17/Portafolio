// ============================================================
//  Dorado sobre mármol marfil (todo procedural, sin texturas)
//
//  1) En JS, al cargar el modelo, se calculan dos datos por vértice:
//     - aStatue: posición en el "espacio de la estatua" (metros, y = 0 en la base,
//       sin el giro de presentación). Sirve para ubicar zonas: alas, base, cuello, cinturón.
//     - aCurv: curvatura. Negativo = arista/cresta (convexo), positivo = hueco.
//       Las crestas de las plumas y los pliegues se doran; los huecos quedan en mármol.
//  2) En el shader se arma una máscara de oro y se mezcla color, metal y rugosidad.
//  3) Los ruidos (nubes, vetas, variación del oro) se calculan POR VÉRTICE y llegan al píxel
//     interpolados (vNA / vNB): es mucho más barato que calcular fbm en cada píxel.
//  4) Coreografía con el scroll: uWingLines/uWingFill pintan las alas desde la punta,
//     uLegs hace subir hilos de oro por las piernas y uPaintGlow da brillo al frente de avance.
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
    uWingLines: { value: 0 },
    uWingFill: { value: 0 },
    uWingSpan: { value: g.wing.span },
    uLegs: { value: 0 },
    uLegsCfg: { value: new THREE.Vector4(g.legs.top, g.legs.ridge, g.legs.cracks, g.legs.width) },
    uPaintGlow: { value: new THREE.Color(g.highlight) },
    uBright: { value: 1 },    // brillo general del mármol (las salas lo bajan)
    uBloomPass: { value: 0 }, // 1 mientras el core dibuja la pasada de bloom: solo sale el oro
    uLightBody: { value: 0 }, // 0..1: la estatua se vuelve figura de luz (Contacto)
    uLightColor: { value: new THREE.Color('#FFF3DC') },
    uGoldGlow: { value: 1 },  // cuánto brilla el oro en el bloom (lo sube el atardecer)
    uTrims: { value: g.trims ?? 1 }, // filetes del pedestal y cinta bajo el pecho (0 = apagados)
    uChrome: { value: 0 },    // 0..1: el oro se derrite en cromo líquido de abajo hacia arriba (al tocar el mar)
    uChromeCol: { value: new THREE.Color('#F4F5F7') },
    uIntro: { value: 0 },     // 1 = intro: negro, con la silueta dibujada en una línea de oro
    uIntroDraw: { value: 0 }, // 0..1: cuánto de la silueta está dibujado (de abajo hacia arriba)
    uTime: { value: 0 },
    // ALQUIMIA: el mármol se transmuta en oro pulido de abajo hacia arriba, con símbolos que se dibujan
    uAlq: { value: 0 },                                  // 0..1 avance de la transmutación (el frente sube por la estatua)
    uAlqGold: { value: new THREE.Color('#E9B65A') },     // oro pulido (reflectancia de oro real, apenas más cálida)
    uAlqSym: { value: 1 },                               // 0..1 cuántos símbolos (calidad: low = 0, solo el frente)
    uSunV: { value: new THREE.Vector3(0, 0.3, -1) },     // hacia el sol, en espacio de vista
    uSunCol: { value: new THREE.Color('#FFC27A') },
    uTrans: { value: 0.5 },                              // luz que atraviesa el mármol fino (alas, pliegues)
    uAO: { value: 0.7 },                                 // oclusión ambiental en los huecos
  };
}

// ---------- GLSL ----------
// Ruido de valor + fbm de 4 octavas (vive en el vertex shader).
const NOISE_GLSL = /* glsl */ `
float mHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float mNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(mHash(i),mHash(i+vec3(1,0,0)),f.x),mix(mHash(i+vec3(0,1,0)),mHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(mHash(i+vec3(0,0,1)),mHash(i+vec3(1,0,1)),f.x),mix(mHash(i+vec3(0,1,1)),mHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float mFbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*mNoise(p); p*=2.03; a*=0.5; } return s; }
`;

export const GILDING_VERTEX_PARS = /* glsl */ `
attribute vec3 aStatue;
attribute float aCurv;
varying vec3 vS;
varying float vCurv;
varying vec4 vNA; // mármol: nube, vetas finas, máscara de vetas, máscara de vetas finas
varying vec4 vNB; // nube, n1 y n2 del oro, variación del oro
${NOISE_GLSL}
`;
export const GILDING_VERTEX = /* glsl */ `
vS = aStatue;
vCurv = aCurv;
{
  vec3 q = aStatue * 2.4;
  vNA = vec4(mFbm(q), mFbm(q * 2.7), mFbm(q * 0.7 + 7.0), mFbm(q * 1.3 - 2.0));
  vec3 gs = aStatue * 1.35;
  vNB = vec4(mFbm(q * 0.55 + 4.0), mFbm(gs * 1.6 + 11.0), mFbm(gs * 0.9 - 3.0), mFbm(aStatue * 9.0));
}
`;

export const GILDING_FRAGMENT_PARS = /* glsl */ `
varying vec4 vNA;
varying vec4 vNB;
varying vec3 vS;
varying float vCurv;
uniform vec3 uGold, uGoldHi;
uniform float uGoldAmount, uWingRidge, uDrapery, uKintsugi, uGoldDebug, uWingLines, uWingFill, uWingSpan, uLegs, uBloomPass, uBright, uLightBody, uGoldGlow, uTrims;
uniform float uChrome, uIntro, uIntroDraw, uTime;
uniform vec3 uLightColor, uChromeCol;
float gChrome = 0.0;
float gMolten = 0.0;
float gIntroLine = 0.0;
float gLightRim = 0.0;
uniform vec4 uLegsCfg; // altura tope, curvatura de las crestas, cantidad de grietas, grosor
uniform vec3 uPaintGlow;
uniform vec2 uTorso, uNeck, uBelt;
uniform vec3 uWing, uBase;
float gGold = 0.0;
float gPaintGlow = 0.0;
uniform float uAlq, uAlqSym, uTrans, uAO;
uniform vec3 uAlqGold, uSunV, uSunCol;
float gAlq = 0.0;      // 0..1: oro pulido (transmutado) en este píxel
float gAlqLine = 0.0;  // líneas y símbolos encendidos
float gAlqEdge = 0.0;  // el filo brillante del frente

// ---- símbolos alquímicos: círculos, triángulos y líneas finas proyectados sobre la estatua ----
float aHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float aSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// triángulo equilátero (apunta arriba): distancia con signo
float aTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
// distancia al trazo del símbolo id en una celda (q en -0.5..0.5); solo se dibuja hasta prog (barrido en el sentido del reloj)
float aSymbol(vec2 q, float id, float prog){
  float a = atan(q.y, q.x) * 0.15915494 + 0.5;
  float r = length(q);
  float d;
  if (id < 0.25) {            // círculo doble con una marca
    d = min(abs(r - 0.36), abs(r - 0.21));
    d = min(d, aSeg(q, vec2(-0.36, 0.0), vec2(-0.21, 0.0)));
  } else if (id < 0.5) {      // triángulo con barra (el aire)
    d = abs(aTri(q + vec2(0.0, 0.03), 0.3));
    d = min(d, aSeg(q, vec2(-0.2, -0.01), vec2(0.2, -0.01)));
  } else if (id < 0.75) {     // el sol: círculo con un punto
    d = min(abs(r - 0.3), abs(r - 0.025));
    d = min(d, aSeg(q, vec2(0.3, 0.0), vec2(0.42, 0.0)));
  } else {                    // triángulo invertido dentro de un círculo
    d = min(abs(aTri(vec2(q.x, -q.y), 0.24)), abs(r - 0.42));
  }
  return d + step(prog, a) * 1e3;
}
// intensidad de las líneas en el punto s (espacio estatua); n = normal de la cara; ahead = distancia hacia adelante del frente
float alqLines(vec3 s, vec3 n, float ahead, float px){
  vec2 ax = s.xz - uTorso;
  float rr = length(ax);
  vec2 rad = ax / max(rr, 1e-3);
  float th = atan(ax.y, ax.x);
  // superficies que miran hacia afuera: se proyecta en cilindro; las de costado (alas), en el plano radio-altura
  bool cyl = abs(dot(n.xz, rad)) > 0.5 || abs(n.y) > 0.8;
  vec2 uv = cyl ? vec2(th * 1.1140846, s.y / 0.45) : vec2(rr / 0.45 + 3.0, s.y / 0.45);
  vec2 cell = floor(uv), q = fract(uv) - 0.5;
  float h = aHash(cell);
  float prog = smoothstep(0.95, 0.12, ahead);            // el trazo se dibuja al acercarse el frente
  float w = max(px * 1.3, 0.012);
  float line = 0.0;
  if (h > 0.38) {
    float d = aSymbol(q, fract(h * 7.31), prog);
    line = 1.0 - smoothstep(w * 0.4, w * 1.4, d);
  }
  // líneas finas: anillos horizontales y diagonales entre los símbolos
  float yy = uv.y * 2.0;
  float ring = 1.0 - smoothstep(w * 0.3, w * 1.5, (0.5 - abs(fract(yy) - 0.5)) * 0.5);
  ring *= step(0.55, aHash(vec2(floor(yy), 3.0))) * smoothstep(0.7, 0.2, ahead) * 0.7;
  float env = smoothstep(1.0, 0.55, ahead) * smoothstep(-0.75, -0.1, ahead);
  return clamp(line + ring, 0.0, 1.0) * env * uAlqSym;
}

float goldMask(vec3 s, float curv, float n1, float n2) {
  float r = length(s.xz - uTorso);              // distancia al eje del torso
  float ridge = smoothstep(-0.05, -0.32, curv); // crestas (convexo)

  // ALAS: crestas de las plumas doradas + puntas bañadas en oro (borde irregular)
  float wing = smoothstep(uWing.x, uWing.x + 0.14, r) * smoothstep(uWing.y, uWing.y + 0.3, s.y);
  float tip = smoothstep(uWing.z, uWing.z + 0.22, r + n1 * 0.12);
  float wingGold = wing * max(ridge * uWingRidge, tip);

  // PINTADO DE LAS ALAS: avanza desde la punta hacia el cuerpo, primero con líneas finas
  // (curvas de nivel doradas) y detrás el oro macizo, con un filo que brilla.
  float wpos = clamp((r - uWing.x) / max(uWingSpan - uWing.x, 0.01), 0.0, 1.0); // 0 = raíz, 1 = punta
  float front = 1.0 - (wpos + n1 * 0.06);                                        // 0 en la punta
  float lineReach = step(front, uWingLines);
  float t = r * 42.0;
  float lines = 1.0 - clamp(min(fract(t), 1.0 - fract(t)) / max(fwidth(t), 1e-4) - 0.6, 0.0, 1.0);
  float filled = 1.0 - smoothstep(uWingFill - 0.03, uWingFill, front);
  float paint = wing * max(filled * step(0.001, uWingFill), lineReach * lines);
  gPaintGlow = wing * (lineReach * lines * (1.0 - filled) * 0.5
             + (1.0 - smoothstep(0.0, 0.05, abs(front - uWingFill))) * step(0.001, uWingFill) * step(uWingFill, 0.999) * 0.7);
  wingGold = max(wingGold, paint);

  // BASE: dos filetes dorados que enmarcan el bloque del pedestal (arriba y abajo)
  float trimTop = smoothstep(uBase.y, 0.0, abs(s.y - uBase.x + 0.015));
  float trimBottom = smoothstep(uBase.y, 0.0, abs(s.y - uBase.z));
  float baseGold = max(trimTop, trimBottom) * (1.0 - wing) * uTrims;

  // CUELLO: corte del cuello cubierto en oro, como un collar
  float neck = smoothstep(uNeck.x - 0.06, uNeck.x + 0.02, s.y) * (1.0 - smoothstep(uNeck.y, uNeck.y + 0.08, r)) * uTrims;

  // CINTURÓN bajo el pecho: una cinta dorada que sigue los pliegues
  float belt = (1.0 - smoothstep(uBelt.y * 0.5, uBelt.y * 0.5 + 0.02, abs(s.y - uBelt.x + n2 * 0.03)))
             * (1.0 - wing) * (1.0 - smoothstep(0.42, 0.5, r)) * uTrims;

  // PLIEGUES: toques de pan de oro solo en las crestas más marcadas del manto
  float drape = (1.0 - wing) * smoothstep(-0.28, -0.5, curv) * smoothstep(0.55, 0.75, n2) * uDrapery
              * step(uBase.x + 0.05, s.y);

  // KINTSUGI: grietas finas rellenas de oro que recorren el mármol
  float crack = 1.0 - smoothstep(0.0, 0.012, abs(n1 - 0.5) - 0.0);
  crack *= smoothstep(0.45, 0.62, n2) * uKintsugi;

  // PIERNAS CONSUMIDAS POR EL ORO: hilos finos que suben desde la base.
  // a) repasan los relieves del manto (curvas de nivel de la curvatura = bordes de los pliegues)
  // b) grietas que se ramifican (curvas de nivel del ruido), más densas a medida que avanza
  float legs = 0.0;
  if (uLegs > 0.0) {
    float legZone = (1.0 - wing) * step(uBase.x + 0.01, s.y) * (1.0 - smoothstep(uLegsCfg.x - 0.1, uLegsCfg.x, s.y));
    float frontY = uBase.x + (uLegsCfg.x - uBase.x) * uLegs * 1.12 + (n2 - 0.5) * 0.25;
    float reach = 1.0 - smoothstep(frontY - 0.06, frontY, s.y);
    float w = uLegsCfg.w;
    float rc = abs(curv - uLegsCfg.y);
    float ridgeLine = 1.0 - smoothstep(0.0, fwidth(curv) * w + 0.004, rc);
    float cf = n1 * uLegsCfg.z + n2 * 2.0;
    float cd = min(fract(cf), 1.0 - fract(cf)) / max(fwidth(cf), 1e-4);
    float crackLine = (1.0 - clamp(cd - w * 0.5, 0.0, 1.0)) * step(1.0 - uLegs * 0.85, n2 + 0.15);
    legs = legZone * reach * max(ridgeLine, crackLine);
    // brillo en el frente de avance (el oro "comiendo" el mármol)
    gPaintGlow = max(gPaintGlow, legs * (0.25 + 0.6 * (1.0 - smoothstep(0.0, 0.18, frontY - s.y))));
  }

  return clamp(max(max(max(wingGold, baseGold), max(neck, belt)), max(max(drape, crack), legs)), 0.0, 1.0) * uGoldAmount;
}
`;

// se inserta después de <color_fragment>
export const GILDING_COLOR = /* glsl */ `
{
  gGold = goldMask(vS, vCurv, vNB.y, vNB.z);
  // oro con leve variación (martillado) entre Oro y Oro brillo
  vec3 goldCol = mix(uGold, uGoldHi, smoothstep(0.35, 0.75, vNB.w));
  diffuseColor.rgb = mix(diffuseColor.rgb, goldCol, gGold);
  if (uGoldDebug > 0.5) diffuseColor.rgb = mix(vec3(0.2), vec3(1.0, 0.1, 0.0), gGold);
  // CROMO LÍQUIDO: un frente que sube desde la base (como si el agua la subiera), ondulado y vivo
  if (uChrome > 0.0) {
    float front = mix(-0.15, 3.25, uChrome) + (vNB.y - 0.5) * 0.22 + sin(vS.x * 9.0 + uTime * 1.3) * 0.025 + sin(vS.z * 7.0 - uTime * 0.9) * 0.02;
    gChrome = 1.0 - smoothstep(front - 0.035, front, vS.y);
    gMolten = (1.0 - smoothstep(0.0, 0.07, abs(vS.y - front + 0.02))) * step(0.001, uChrome) * step(uChrome, 0.999);
    // el oro que está por derretirse brilla más justo encima del frente
    gGold = max(gGold * (1.0 - gChrome), gMolten);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGold, uGoldHi, 0.6), gMolten);
    diffuseColor.rgb = mix(diffuseColor.rgb, uChromeCol, gChrome);
  }
  // ALQUIMIA: un frente sube desde la base; atrás queda oro pulido, adelante se encienden los símbolos
  if (uAlq > 0.0) {
    float afront = mix(-0.3, 3.5, uAlq) + (vNB.y - 0.5) * 0.2 + sin(vS.x * 9.0 + uTime * 1.3) * 0.022 + sin(vS.z * 7.0 - uTime * 0.9) * 0.018;
    float ad = vS.y - afront;                                    // + adelante (arriba) · − ya transmutado
    gAlq = smoothstep(0.03, -0.12, ad);
    vec3 ag = mix(uAlqGold * 0.9, uAlqGold * 1.1, smoothstep(0.3, 0.8, vNB.w));
    diffuseColor.rgb = mix(diffuseColor.rgb, ag, gAlq);
    gAlqEdge = (1.0 - smoothstep(0.0, 0.09, abs(ad + 0.02))) * step(0.001, uAlq) * step(uAlq, 0.995);
    vec3 fn = normalize(cross(dFdx(vS), dFdy(vS)));              // las derivadas, fuera del if (control de flujo uniforme)
    float pxs = length(fwidth(vS)) / 0.45;
    if (uAlqSym > 0.01 && ad > -0.78 && ad < 1.05) gAlqLine = alqLines(vS, fn, ad, pxs);
    gGold = max(gGold, gAlq);
  }
}
`;

// se inserta después de <metalnessmap_fragment>
export const GILDING_PBR = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 1.0, gGold);
roughnessFactor = mix(roughnessFactor, 0.2, gGold);
metalnessFactor = mix(metalnessFactor, 1.0, gChrome);
roughnessFactor = mix(roughnessFactor, 0.05, gChrome);   // cromo líquido: espejo casi perfecto
metalnessFactor = mix(metalnessFactor, 1.0, gAlq);
roughnessFactor = mix(roughnessFactor, 0.13, gAlq);      // oro pulido
`;

// se inserta después de <emissivemap_fragment>: brillo del "lápiz" que pinta el oro
export const GILDING_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += uPaintGlow * gPaintGlow * uGoldAmount * (1.0 - gChrome);
totalEmissiveRadiance += uPaintGlow * gMolten * 1.6;     // filo de oro derretido
totalEmissiveRadiance += uPaintGlow * (gAlqLine * 1.25 + gAlqEdge * 1.9);   // símbolos y filo de la transmutación
{
  // el mármol fino (alas, crestas de los pliegues) deja pasar un poco de la luz del sol: se ve piedra, no plástico
  vec3 Vt = normalize(vViewPosition);
  vec3 Lt = normalize(uSunV);
  float thin = smoothstep(-0.03, -0.32, vCurv) * 0.85 + smoothstep(0.42, 0.95, length(vS.xz - uTorso)) * smoothstep(1.65, 2.1, vS.y) * 0.9;
  float through = pow(clamp(dot(-Lt, Vt) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float rimT = pow(1.0 - clamp(dot(normalize(normal), Vt), 0.0, 1.0), 2.0);
  vec3 sss = uSunCol * vec3(1.0, 0.74, 0.55) * clamp(thin, 0.0, 1.0) * (0.12 + 0.88 * through) * (0.3 + 0.7 * rimT) * uTrans;
  totalEmissiveRadiance += sss * (1.0 - max(gGold, gChrome)) * 0.55;
}
`;

// se inserta después de <opaque_fragment>: baja el brillo de todo (mármol y oro) en las salas
export const GILDING_DIM = /* glsl */ `
gl_FragColor.rgb *= uBright;
if (uIntro > 0.001) {
  // INTRO: la figura en negro y su silueta trazada con una línea de oro fina, de abajo hacia arriba
  vec3 Vn = normalize(vViewPosition);
  float facing = abs(dot(normalize(normal), Vn));
  // contorno: una línea fina (el ancho se mide en píxeles, así no se ve granulada)
  float fw = fwidth(facing) * 1.5 + 1e-4;
  float sil = 1.0 - smoothstep(0.06, 0.06 + fw, facing);
  float fold = 0.0;
  float reach = uIntroDraw * 3.35 + (vNB.y - 0.5) * 0.12;
  float drawn = 1.0 - smoothstep(reach - 0.02, reach, vS.y);
  float pen = (1.0 - smoothstep(0.0, 0.06, abs(vS.y - reach))) * step(uIntroDraw, 0.995);
  gIntroLine = max(sil, fold) * drawn + pen * sil * 2.0;
  vec3 introCol = mix(uGold, uGoldHi, 0.65) * gIntroLine * 1.4;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, introCol, uIntro);
}
if (uLightBody > 0.001) {
  // figura de luz (ref04/ref05): blanca-dorada, con el contorno más intenso, pero sin perder los pliegues
  gLightRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  float ndl = 0.5 + 0.5 * dot(normalize(normal), normalize(vec3(-0.35, 0.65, 0.7)));
  vec3 lightCol = uLightColor * (0.5 + 0.62 * ndl + gLightRim * 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, lightCol, uLightBody);
}
`;

// se inserta después de <dithering_fragment>: en la pasada de bloom del core solo sale el oro
// (o, en Contacto, toda la figura de luz)
export const GILDING_BLOOM = /* glsl */ `
if (uBloomPass > 0.5) {
  vec3 goldB = mix(uGold, uGoldHi, 0.5) * gGold * (0.6 + gPaintGlow * 1.2) * uBright * uGoldGlow;
  vec3 lightB = uLightColor * gLightRim * 0.9; // halo en el contorno: el interior conserva sus pliegues
  vec3 b = mix(goldB, lightB, uLightBody);
  // cromo: solo los brillos fuertes (el sol reflejado) entran al resplandor
  b += max(gl_FragColor.rgb - 1.6, 0.0) * 0.35 * gChrome * uGoldGlow * 2.0;
  b += mix(uGold, uGoldHi, 0.6) * gMolten * 0.9 * uGoldGlow * 2.0;
  b += uGoldHi * (gAlqLine * 0.8 + gAlqEdge * 1.5) * uGoldGlow;
  b += max(gl_FragColor.rgb - 2.4, 0.0) * 0.12 * gAlq * uGoldGlow;       // solo el brillo del sol en el oro pulido
  b = mix(b, mix(uGold, uGoldHi, 0.65) * gIntroLine * 1.2, uIntro);
  gl_FragColor = vec4(b, 1.0);
}
`;
