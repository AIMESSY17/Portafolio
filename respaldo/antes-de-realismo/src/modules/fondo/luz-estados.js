// Estados de luz de "Hecha de luz". Cada uno es la foto completa de cómo se ve el mundo: cielo, sol,
// nubes, mar y luces. El fondo mezcla estos estados en cada cuadro (sin crear objetos).
//   dia        hero: celeste muy claro arriba, blanco cálido abajo, sol dorado de costado (ref01)
//   atardecer  base de las salas: oro y champán sobre el mar (ref08, ref10)
//   salas      cada proyecto cambia APENAS el tono del atardecer y del mar
//   noche      Contacto, la hora azul: #1B2340 → #4A5A8C con una franja naranja finita (ref05)
// Ángulos en grados. sunAz: 0 = de frente (detrás de la estatua), + = hacia la derecha.

export const COLOR_KEYS = [
  'zenith', 'horizon', 'below', 'sun', 'band', 'bandHi',
  'cloudLit', 'cloudShade', 'cloudRim',
  'seaDeep', 'seaShallow', 'haze', 'sand', 'foam',
  'hemiSky', 'hemiGround', 'glintGold', 'glintSilver', 'veil',
];
export const NUMBER_KEYS = [
  'sunAz', 'sunEl', 'sunGlow', 'sunDisc', 'bandI', 'stars', 'curve',
  'sunI', 'hemiI', 'envI', 'exposure', 'cloudUnder', 'cloudRimI',
  'glints', 'spec', 'glitter', 'reflI', 'goldMix', 'detail',
];

const DIA = {
  zenith: '#9CBCD1', horizon: '#E6ECEB', below: '#F7F1E7', sun: '#FFE2B0', band: '#FFF1DA', bandHi: '#FFFFFF',
  cloudLit: '#FFFFFF', cloudShade: '#C3C6D3', cloudRim: '#FFEED0',
  seaDeep: '#4B5567', seaShallow: '#8FA3B2', haze: '#E6ECEB', sand: '#9C8F80', foam: '#FFFFFF',
  hemiSky: '#CFE0EC', hemiGround: '#EAD9C0', glintGold: '#FFE7B5', glintSilver: '#FFFFFF', veil: '#FBF8F2',
  sunAz: 118, sunEl: 26, sunGlow: 0.55, sunDisc: 0, bandI: 0, stars: 0, curve: 0.6,
  sunI: 4.4, hemiI: 0.72, envI: 0.24, exposure: 1.3, cloudUnder: 0, cloudRimI: 0.35,
  glints: 0, spec: 0.5, glitter: 0.25, reflI: 1, goldMix: 0.6, detail: 0.5,
};

const ATARDECER = {
  zenith: '#5D6C98', horizon: '#F1BF89', below: '#E8B88C', sun: '#FFC27A', band: '#FFB86E', bandHi: '#EFA2A0',
  cloudLit: '#FFD49C', cloudShade: '#6C6081', cloudRim: '#FFE2AE',
  seaDeep: '#211D28', seaShallow: '#5A4A4D', haze: '#E5B286', sand: '#2B2730', foam: '#F3E1C8',
  hemiSky: '#7E79A6', hemiGround: '#9A7558', glintGold: '#FFE0A2', glintSilver: '#F5F3FF', veil: '#F7E6CF',
  sunAz: -17, sunEl: 4.2, sunGlow: 1, sunDisc: 2.4, bandI: 0.5, stars: 0, curve: 0.42,
  sunI: 2.4, hemiI: 1.05, envI: 0.3, exposure: 1.12, cloudUnder: 1, cloudRimI: 0.8,
  glints: 1, spec: 1, glitter: 1, reflI: 1, goldMix: 0.62, detail: 0.55,
};

const NOCHE = {
  zenith: '#1B2340', horizon: '#4A5A8C', below: '#2A3356', sun: '#A8B8E4', band: '#E6A884', bandHi: '#96788F',
  cloudLit: '#56628F', cloudShade: '#232A49', cloudRim: '#C39DA6',
  seaDeep: '#121624', seaShallow: '#283048', haze: '#3E4B78', sand: '#1F222B', foam: '#B9C5EA',
  hemiSky: '#3A4A7C', hemiGround: '#14141E', glintGold: '#E6A884', glintSilver: '#C9D6FF', veil: '#3E4B78',
  sunAz: -12, sunEl: -1.5, sunGlow: 0.32, sunDisc: 0, bandI: 1, stars: 0.75, curve: 0.5,
  sunI: 0.45, hemiI: 0.65, envI: 0.5, exposure: 1, cloudUnder: 1, cloudRimI: 0.45,
  glints: 0.035, spec: 0.2, glitter: 0.15, reflI: 1, goldMix: 0.3, detail: 0.4,
};

// salas: solo lo que cambia respecto del atardecer
const SALAS = {
  'tinta-negra': { // agua oscura como tinta
    seaDeep: '#08070C', seaShallow: '#1A1720', zenith: '#4B5680', horizon: '#E8AE7C', haze: '#C59371', goldMix: 0.45, sunAz: -21,
  },
  'mantra-estetica': { // lavanda
    zenith: '#7B77A8', horizon: '#E8BDB6', band: '#F2B5A9', bandHi: '#C7A5D8', sun: '#FFCFB9', cloudLit: '#F3D1D7', cloudShade: '#74689A',
    seaDeep: '#2A2537', seaShallow: '#6B5E80', haze: '#D6B3C0', hemiSky: '#8E86B8', sunAz: -12,
  },
  'aura-aika': { // turquesa y oro
    zenith: '#5B89A5', horizon: '#F6C478', sun: '#FFC775', cloudLit: '#FFD898', seaDeep: '#0B3236', seaShallow: '#2C7876', haze: '#E7BF88',
    hemiSky: '#6E95AE', goldMix: 0.82, sunAz: -14,
  },
  zurklima: { // plateado frío
    zenith: '#6A778F', horizon: '#D3D8DF', band: '#E7EAF0', bandHi: '#B8C1D1', sun: '#F3F5FA', cloudLit: '#E8ECF3', cloudShade: '#5B6476',
    cloudRim: '#F4F6FA', seaDeep: '#1E232C', seaShallow: '#525B68', haze: '#C2C9D4', hemiSky: '#8C96AB', hemiGround: '#5E6672',
    glintGold: '#F1F3F8', goldMix: 0.12, sunAz: -20,
  },
  'la-pastoril': { // oro de mañana
    zenith: '#9BB5CA', horizon: '#FFDF9E', band: '#FFE6B3', bandHi: '#FFF0D0', sun: '#FFE2A0', cloudLit: '#FFEFC6', cloudShade: '#8E8693',
    seaDeep: '#39342A', seaShallow: '#8A7A52', haze: '#F2D79F', hemiSky: '#A9BBD0', sunEl: 8.5, sunAz: -10, goldMix: 0.85,
  },
  chufas: { // rosado
    zenith: '#8D85AD', horizon: '#F2BEB0', band: '#F6B29E', bandHi: '#E2A5BF', sun: '#FFC3A9', cloudLit: '#F9D2CA', cloudShade: '#79698D',
    seaDeep: '#31263A', seaShallow: '#845F6D', haze: '#E3B2AD', hemiSky: '#9A8BB4', sunAz: -15,
  },
  'casa-de-muffin': { // ámbar rosado
    zenith: '#937EA1', horizon: '#F5C399', band: '#FFB88D', bandHi: '#EAA8AD', sun: '#FFCA9B', cloudLit: '#FFD8B7', cloudShade: '#7B6583',
    seaDeep: '#36272A', seaShallow: '#8C6761', haze: '#E8B695', hemiSky: '#9C86A6', sunAz: -19,
  },
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
