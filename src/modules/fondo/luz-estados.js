// Estados de luz (versión fotográfica). Cada uno es la foto completa de cómo se ve el mundo: el retoque de
// cada panorama, sol, nubes, mar y luces. El fondo mezcla estos estados en cada cuadro (sin crear objetos).
//   dia        hero: arriba del mar de nubes, cielo de día con cúmulos
//   atardecer  base del mar y las salas: el sol dorado sobre el horizonte
//   salas      cada proyecto cambia APENAS el tono del cielo y del mar
//   noche      Contacto, la hora azul con estrellas
// Qué panorama se ve lo decide el guion (pesos), no el estado: acá solo está cómo se retoca cada uno.

export const COLOR_KEYS = [
  'sun', 'skyTint', 'below',
  'cloudLit', 'cloudShade', 'veil',
  'seaDeep', 'seaShallow', 'haze', 'sand', 'foam',
  'hemiSky', 'hemiGround', 'glintGold', 'glintSilver', 'horizonte',
];
export const NUMBER_KEYS = [
  'expoDia', 'expoTarde', 'expoCrep', 'contrastDia', 'contrastTarde', 'contrastCrep', 'satDia', 'satTarde', 'satCrep',
  'belowK', 'sunI', 'hemiI', 'envI', 'exposure',
  'glints', 'spec', 'glitter', 'reflI', 'goldMix', 'detail', 'hazeK', 'sunK',
];

const COMUN = {
  expoDia: 1.0, expoTarde: 1.0, expoCrep: 1.0,
  contrastDia: 1.16, contrastTarde: 1.12, contrastCrep: 1.08,
  satDia: 1.18, satTarde: 1.12, satCrep: 1.05,
};

const DIA = {
  ...COMUN,
  sun: '#FFF2DE', skyTint: '#FFFFFF', below: '#E4EAF0',
  cloudLit: '#FFFFFF', cloudShade: '#9FAABD', veil: '#F6F8FA',
  seaDeep: '#3A4A5E', seaShallow: '#7E93A6', haze: '#E4EAF0', sand: '#9C8F80', foam: '#FFFFFF',
  hemiSky: '#CFE0EC', hemiGround: '#EEF1F4', glintGold: '#FFF3DA', glintSilver: '#FFFFFF', horizonte: '#EAF1F5', hazeK: 0.22, sunK: 0.35,
  belowK: 1, sunI: 1.4, hemiI: 0.12, envI: 1.0, exposure: 1.0,
  glints: 0, spec: 0.5, glitter: 0.25, reflI: 1, goldMix: 0.5, detail: 0.5,
};

const ATARDECER = {
  ...COMUN,
  sun: '#FFC27A', skyTint: '#FFFFFF', below: '#9B90A6',
  cloudLit: '#FFD9A8', cloudShade: '#6D6384', veil: '#EFE2DA',
  seaDeep: '#16141F', seaShallow: '#463F55', haze: '#B9A6B3', sand: '#2B2730', foam: '#F3E1C8',
  hemiSky: '#8E86AC', hemiGround: '#4A3F4A', glintGold: '#FFE0A2', glintSilver: '#F5F3FF', horizonte: '#EDB98C', hazeK: 0.36, sunK: 1,
  belowK: 0, sunI: 2.0, hemiI: 0.16, envI: 1.0, exposure: 1.0,
  glints: 1, spec: 1, glitter: 1, reflI: 1, goldMix: 0.7, detail: 0.55,
};

const NOCHE = {
  ...COMUN,
  expoCrep: 0.62, contrastCrep: 1.12,
  sun: '#A8B8E4', skyTint: '#FFFFFF', below: '#2A3356',
  cloudLit: '#56628F', cloudShade: '#232A49', veil: '#3E4B78',
  seaDeep: '#0B0F1C', seaShallow: '#1F2740', haze: '#363F62', sand: '#1B1D26', foam: '#B9C5EA',
  hemiSky: '#3A4A7C', hemiGround: '#14141E', glintGold: '#E6C8A4', glintSilver: '#D6E0FF', horizonte: '#55659A', hazeK: 0.5, sunK: 0,
  belowK: 0, sunI: 0.3, hemiI: 0.2, envI: 0.75, exposure: 1.05,
  glints: 0.16, spec: 0.25, glitter: 0.35, reflI: 1, goldMix: 0.2, detail: 0.4,
};

// salas: solo lo que cambia respecto del atardecer (tintes leves: la foto manda)
const SALAS = {
  'tinta-negra': { skyTint: '#F2EEF2', seaDeep: '#07060B', seaShallow: '#1A1720', haze: '#A8949C', goldMix: 0.5 },
  'aura-aika': { skyTint: '#FFF6E8', seaDeep: '#0B2A2E', seaShallow: '#2C6A6A', haze: '#C9B39A', goldMix: 0.85 },
  zurklima: { skyTint: '#EEF0F6', sun: '#F3F5FA', seaDeep: '#1A1F28', seaShallow: '#4A5361', haze: '#AEB4C2', glintGold: '#F1F3F8', goldMix: 0.12 },
  'la-pastoril': { skyTint: '#FFF7E6', sun: '#FFD99A', seaDeep: '#2A2620', seaShallow: '#6E6046', haze: '#D2BE9C', goldMix: 0.9 },
  chufas: { skyTint: '#FFF0F0', seaDeep: '#271E2E', seaShallow: '#6E5160', haze: '#CFA9AE' },
  'casa-de-muffin': { skyTint: '#FFF2EA', sun: '#FFCA9B', seaDeep: '#2C2024', seaShallow: '#7A5A56', haze: '#D6AE9C' },
};

/** Estado vacío (todos los colores ya creados). */
export function createEstado(THREE) {
  const s = {};
  for (const k of COLOR_KEYS) s[k] = new THREE.Color();
  for (const k of NUMBER_KEYS) s[k] = 0;
  return s;
}
/** Copia un estado (o una definición con hex) en `out`. */
export function copyEstado(out, src) {
  for (const k of COLOR_KEYS) if (src[k] !== undefined) out[k].set(src[k]);
  for (const k of NUMBER_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}
/** out = mezcla de a y b (t = 0..1). Colores en espacio lineal. */
export function mixEstado(out, a, b, t) {
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUMBER_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Todos los estados ya convertidos a THREE.Color (se crean UNA vez, al cargar). */
export function createEstados(THREE) {
  const dia = copyEstado(createEstado(THREE), DIA);
  const atardecer = copyEstado(createEstado(THREE), ATARDECER);
  const noche = copyEstado(createEstado(THREE), NOCHE);
  const salas = {};
  for (const id in SALAS) salas[id] = copyEstado(copyEstado(createEstado(THREE), ATARDECER), SALAS[id]);
  return { dia, atardecer, noche, salas };
}
