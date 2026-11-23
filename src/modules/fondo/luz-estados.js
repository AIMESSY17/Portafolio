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

// Versión película: los panoramas entran como luz real (decodificados) y el tono lo pone ACES en el post, que sube
// mucho los medios. Por eso la exposición de cada foto va por debajo de 1 y el atardecer (Belfast, muy brumoso)
// lleva más contraste y saturación: el LUT termina de darle el color.
const COMUN = {
  expoDia: 0.6, expoTarde: 0.3, expoCrep: 0.5,
  contrastDia: 1.12, contrastTarde: 1.62, contrastCrep: 1.12,
  satDia: 1.12, satTarde: 1.5, satCrep: 1.1,
};

const DIA = {
  ...COMUN,
  sun: '#FFF2DE', skyTint: '#FFFFFF', below: '#E4EAF0',
  cloudLit: '#FFFFFF', cloudShade: '#9FAABD', veil: '#F6F8FA',
  seaDeep: '#3A4A5E', seaShallow: '#7E93A6', haze: '#E4EAF0', sand: '#9C8F80', foam: '#FFFFFF',
  hemiSky: '#CFE0EC', hemiGround: '#EEF1F4', glintGold: '#FFF3DA', glintSilver: '#FFFFFF', horizonte: '#EAF1F5', hazeK: 0.22, sunK: 0.35,
  belowK: 1, sunI: 1.4, hemiI: 0.12, envI: 1.0, exposure: 0.82,
  glints: 0, spec: 0.5, glitter: 0.25, reflI: 1, goldMix: 0.5, detail: 0.5,
};

const ATARDECER = {
  ...COMUN,
  sun: '#FFC27A', skyTint: '#FFFFFF', below: '#9B90A6',
  cloudLit: '#FFD9A8', cloudShade: '#6D6384', veil: '#EFE2DA',
  seaDeep: '#16141F', seaShallow: '#463F55', haze: '#B9A6B3', sand: '#2B2730', foam: '#F3E1C8',
  hemiSky: '#8E86AC', hemiGround: '#4A3F4A', glintGold: '#FFE0A2', glintSilver: '#F5F3FF', horizonte: '#F0A35F', hazeK: 0.3, sunK: 1,
  belowK: 0, sunI: 2.0, hemiI: 0.16, envI: 1.0, exposure: 0.85,
  glints: 1, spec: 1, glitter: 1, reflI: 1, goldMix: 0.7, detail: 0.55,
};

const NOCHE = {
  ...COMUN,
  expoCrep: 0.42, contrastCrep: 1.15,
  sun: '#A8B8E4', skyTint: '#FFFFFF', below: '#2A3356',
  cloudLit: '#56628F', cloudShade: '#232A49', veil: '#3E4B78',
  seaDeep: '#0B0F1C', seaShallow: '#1F2740', haze: '#363F62', sand: '#1B1D26', foam: '#B9C5EA',
  hemiSky: '#3A4A7C', hemiGround: '#14141E', glintGold: '#E6C8A4', glintSilver: '#D6E0FF', horizonte: '#55659A', hazeK: 0.5, sunK: 0,
  belowK: 0, sunI: 0.3, hemiI: 0.2, envI: 0.75, exposure: 0.95,
  glints: 0.16, spec: 0.25, glitter: 0.35, reflI: 1, goldMix: 0.2, detail: 0.4,
};

// salas: solo lo que cambia respecto del atardecer (tintes leves: la foto manda)
const SALAS = {
  // tinta: agua negra como tinta y una luz rojo ceniza, rasante
  'tinta-negra': { skyTint: '#E6D6D4', sun: '#E46A52', seaDeep: '#040306', seaShallow: '#17101A', haze: '#9A7C7E', horizonte: '#C9806A', glintGold: '#FFB59A', goldMix: 0.45 },
  // mantra: agua lavanda quieta, bruma baja
  'mantra-estetica': { skyTint: '#F0E8F8', sun: '#F4D8EC', seaDeep: '#3A3152', seaShallow: '#8D7FB4', haze: '#CFC1E3', horizonte: '#DCCCEC', glintGold: '#F6EAFF', glintSilver: '#FFFFFF', goldMix: 0.25, hazeK: 0.5 },
  // aura aika: hora dorada fuerte y mar turquesa
  'aura-aika': { skyTint: '#FFEFD2', sun: '#FFB257', seaDeep: '#04323A', seaShallow: '#1D8F88', haze: '#EBB884', horizonte: '#F4B477', goldMix: 0.95 },
  // zurklima: la toma pasa a térmico en blanco y negro (lo hace el post); el mundo, neutro
  zurklima: { skyTint: '#EEF0F6', sun: '#F3F5FA', seaDeep: '#1A1F28', seaShallow: '#4A5361', haze: '#AEB4C2', glintGold: '#F1F3F8', goldMix: 0.12 },
  // la pastoril: mañana de campo, agua dorada, bruma suave (y polen)
  'la-pastoril': { skyTint: '#FFF6DF', sun: '#FFDE9C', seaDeep: '#3A2D16', seaShallow: '#9D7E3C', haze: '#E7D3A6', horizonte: '#F2DCA6', goldMix: 0.95, hazeK: 0.45 },
  // chufas: agua rosa pastel (y un hilo dorado que cose el cielo)
  chufas: { skyTint: '#FFEEF2', sun: '#FFD3DA', seaDeep: '#4A2D3E', seaShallow: '#C890A7', haze: '#EAC4D0', horizonte: '#F3CED8', goldMix: 0.5 },
  // casa de muffin: agua ámbar-rosa (y azúcar impalpable que cae)
  'casa-de-muffin': { skyTint: '#FFF0E4', sun: '#FFC08C', seaDeep: '#4A2921', seaShallow: '#BA7A61', haze: '#E7B99F', horizonte: '#F0C19B', goldMix: 0.8 },
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
