// Atmósferas: cómo se ve la sala en cada sección, en el mundo de cada proyecto (hover) y en cada SALA.
// sun: color de la luz principal · az/el: desde dónde llega (radianes, alrededor de la estatua; az 0 = de frente)
// fill: luz de relleno del otro lado · dome*: cielo (arriba, abajo, resplandor) · ember: color de las brasas
// scan: visión nocturna (0–1) · ink: humo de tinta (0–1) · embers: cantidad relativa de brasas
// Galería sobria: el mundo de cada proyecto con hover solo TIÑE la luz de la sección un PROJECT_TINT (30 %).

// Una atmósfera por sección de config/sections.js, en el mismo orden: hero, obras, contacto.
export const SECTIONS = [
  { // hero — amanecer: la luz entra rasante desde arriba a la izquierda
    word: 'VICTORIA', sun: '#FFB15A', sunI: 1.0, az: -2.1, el: 0.85, fill: '#7E8FB0', fillI: 0.35,
    domeTop: '#05060B', domeBot: '#100B07', domeGlow: '#2E1C0C', ember: '#FF9A3C', embers: 0.6, beam: 1.0, scan: 0, ink: 0,
  },
  { // obras — mediodía dorado, desde arriba
    word: 'OBRAS', sun: '#FFD9A6', sunI: 1.1, az: 1.45, el: 1.0, fill: '#8C9BB8', fillI: 0.3,
    domeTop: '#06070B', domeBot: '#0F0B08', domeGlow: '#2A1C0C', ember: '#FFC46A', embers: 0.45, beam: 0.85, scan: 0, ink: 0,
  },
  { // contacto — noche de fragua: contraluz desde atrás
    word: 'ENCARGOS', sun: '#FF6A2A', sunI: 1.15, az: 3.0, el: 0.32, fill: '#3E4C78', fillI: 0.28,
    domeTop: '#040409', domeBot: '#180904', domeGlow: '#4A1A08', ember: '#FF5A1E', embers: 1.0, beam: 0.9, scan: 0, ink: 0,
  },
];

// Mundos de cada proyecto (se aplican encima de la sección mientras dura el hover)
export const PROJECTS = {
  'tinta-negra':       { sun: '#B5675C', sunI: 1.05, fill: '#4A2A2C', fillI: 0.33, domeTop: '#0A0606', domeBot: '#1A0E0C', domeGlow: '#3E211A', ember: '#C27B6C', embers: 0.6, beam: 0.9, scan: 0, ink: 1 },
  'mantra-estetica':   { sun: '#D9B6FF', sunI: 1.0, fill: '#FFC2A6', fillI: 0.45, domeTop: '#0C0814', domeBot: '#1E1224', domeGlow: '#40284E', ember: '#F2C6FF', embers: 0.5, beam: 0.9, scan: 0, ink: 0 },
  'aura-aika':         { sun: '#FF7E48', sunI: 1.15, fill: '#FF5F9E', fillI: 0.5, domeTop: '#150A20', domeBot: '#3E1610', domeGlow: '#7A3818', ember: '#FFB070', embers: 0.5, beam: 1.0, scan: 0, ink: 0 },
  'zurklima':          { sun: '#A3AE98', sunI: 0.9, fill: '#4F5A4D', fillI: 0.33, domeTop: '#060807', domeBot: '#0E120E', domeGlow: '#2A3328', ember: '#B7BFAA', embers: 0.35, beam: 0.6, scan: 1, ink: 0 },
  'la-pastoril':       { sun: '#FFD67A', sunI: 1.05, fill: '#A6D88A', fillI: 0.45, domeTop: '#0A0D07', domeBot: '#1E1A0B', domeGlow: '#4A3A12', ember: '#FFE7A0', embers: 0.45, beam: 1.0, scan: 0, ink: 0 },
  'chufas':            { sun: '#FFC9D6', sunI: 1.0, fill: '#BFE6DA', fillI: 0.5, domeTop: '#110D12', domeBot: '#201719', domeGlow: '#4E3036', ember: '#FFE0E8', embers: 0.45, beam: 0.9, scan: 0, ink: 0 },
  'casa-de-muffin':    { sun: '#FFB3CB', sunI: 1.05, fill: '#FFF0A8', fillI: 0.5, domeTop: '#160C12', domeBot: '#2A1820', domeGlow: '#5A3040', ember: '#FFD1DC', embers: 0.5, beam: 0.95, scan: 0, ink: 0 },
};

// ---------- Salas (sección "obras"): un mundo sutil por proyecto ----------
// Se mezclan sobre la atmósfera de "obras" con ROOM_TINT (la luz y el aire cuentan la historia; nunca
// compiten con la ventana). Además de la luz y el cielo, cada mundo mueve UNA capa liviana de partículas
// (mundo.js) con estos parámetros, que se mezclan suavemente igual que los colores:
//   pColor/pAmount/pSize: color, cantidad (0–1) y tamaño · pStar: 0 punto suave → 1 destello en cruz
//   pStretch: 0 redondo → alargado (hojuelas, semillas) · pTwinkle: titileo · pMoveX/Y/Z: deriva (m/s)
// Y los extras: columns (opacidad de las columnas), grain (grano extra), mist (bruma baja del piso),
// calm (ondas lentas y anchas del piso), glint (destellos titilando en el piso), thread (hilo dorado
// que se cose con el progress de la sala), vig (viñeta detrás de la ventana: baja el brillo), visor
// (esquinas finas de cámara alrededor de la ventana).
export const ROOM_TINT = 0.8;
export const SALAS = {
  'tinta-negra': { // luz rojo ceniza rasante; humo de tinta que se abre; ceniza que sube; columnas casi apagadas
    sun: '#B0554A', sunI: 0.95, az: 1.9, el: 0.05, fill: '#3A2A2C', fillI: 0.3,
    domeTop: '#070404', domeBot: '#140908', domeGlow: '#3A1A14', ember: '#9A6A5E', embers: 0.25, beam: 0.55, scan: 0, ink: 0.85,
    columns: 0.12, vig: 0.3, pColor: '#8C8480', pAmount: 0.8, pSize: 1.0, pStretch: 0.6, pTwinkle: 0.1, pMoveY: 0.18,
  },
  'mantra-estetica': { // lavanda de spa, difusa; bruma baja y ondas lentas en el piso
    sun: '#C9B6E6', sunI: 0.9, az: 0.6, el: 0.7, fill: '#E7D8F2', fillI: 0.45,
    domeTop: '#0B0912', domeBot: '#17121F', domeGlow: '#3A2E4C', ember: '#D8C8F0', embers: 0.2, beam: 0.5, scan: 0, ink: 0,
    columns: 0.7, vig: 0.3, mist: 0.65, calm: 0.8, pColor: '#D9CBEE', pAmount: 0.3, pSize: 1.1, pTwinkle: 0.1, pMoveY: 0.025,
  },
  'aura-aika': { // atardecer de playa, naranja-rosa casi horizontal; destellos de sol en el mar; arena fina de costado
    sun: '#F28A6A', sunI: 1.05, az: -1.3, el: 0.1, fill: '#E58AA0', fillI: 0.4,
    domeTop: '#140D1A', domeBot: '#2A1612', domeGlow: '#7A3A22', ember: '#FFC09A', embers: 0.3, beam: 0.9, scan: 0, ink: 0,
    columns: 0.6, vig: 0.3, glint: 0.9, pColor: '#F1D2A8', pAmount: 0.6, pSize: 0.7, pMoveX: 0.6, pMoveY: -0.03,
  },
  'zurklima': { // luz fría y blanca de cámara desde arriba; grano; líneas de escaneo tenues (sin verde); visor
    sun: '#DDE6EE', sunI: 0.95, az: 0.1, el: 1.25, fill: '#8FA0B3', fillI: 0.35,
    domeTop: '#07090C', domeBot: '#0C0F12', domeGlow: '#26303A', ember: '#C8D2DB', embers: 0.15, beam: 0.7, scan: 0.22, ink: 0,
    columns: 0.7, vig: 0.3, grain: 0.6, visor: 1, pColor: '#E6EEF5', pAmount: 0.2, pSize: 0.6, pMoveY: 0.01,
  },
  'la-pastoril': { // mañana de campo: luz dorada cálida, cielo crema; polen y semillas hacia arriba muy lento
    sun: '#F2CC7A', sunI: 1.05, az: -0.6, el: 0.55, fill: '#B8C99A', fillI: 0.35,
    domeTop: '#1A1710', domeBot: '#322A18', domeGlow: '#6E5A2C', ember: '#F5DFA0', embers: 0.4, beam: 1.0, scan: 0, ink: 0,
    columns: 0.8, vig: 0.3, pColor: '#F4E3B0', pAmount: 0.55, pSize: 0.8, pStretch: 0.5, pTwinkle: 0.15, pMoveY: 0.07,
  },
  'chufas': { // rosa empolvado; un hilo dorado que se cose con el progress; brillitos de lentejuela
    sun: '#F0B6C2', sunI: 1.0, az: 0.9, el: 0.6, fill: '#E8C9D0', fillI: 0.4,
    domeTop: '#120D10', domeBot: '#22171B', domeGlow: '#583842', ember: '#F8D0DA', embers: 0.25, beam: 0.8, scan: 0, ink: 0,
    columns: 0.8, vig: 0.3, thread: 1, pColor: '#F6E3C0', pAmount: 0.5, pSize: 0.6, pStar: 1, pTwinkle: 0.9, pMoveY: 0.015,
  },
  'casa-de-muffin': { // luz cálida de horno, ámbar-rosa; harina y azúcar impalpable cayendo muy lento
    sun: '#FFB27A', sunI: 1.1, az: -1.0, el: 0.5, fill: '#FFC9B0', fillI: 0.45,
    domeTop: '#17100F', domeBot: '#2E1A14', domeGlow: '#72391F', ember: '#FFD2A8', embers: 0.35, beam: 1.0, scan: 0, ink: 0,
    columns: 0.7, vig: 0.3, pColor: '#FFF1E0', pAmount: 0.65, pSize: 0.75, pTwinkle: 0.1, pMoveX: 0.02, pMoveY: -0.08,
  },
};

export const COLOR_KEYS = ['sun', 'fill', 'domeTop', 'domeBot', 'domeGlow', 'ember', 'pColor'];
const BLENDED = ['sunI', 'fillI', 'embers', 'beam', 'scan', 'ink'];   // se mezclan con el tinte (hover 30 %, sala 80 %)
// se fijan tal cual (valores por defecto: sin mundo)
const EXTRAS = { columns: 1, grain: 0, mist: 0, calm: 0, glint: 0, thread: 0, vig: 0, visor: 0, pAmount: 0, pSize: 1, pStar: 0, pStretch: 0, pTwinkle: 0, pMoveX: 0, pMoveY: 0, pMoveZ: 0 };
export const NUMBER_KEYS = [...BLENDED, ...Object.keys(EXTRAS)];
export const PROJECT_TINT = 0.3; // cuánto se acerca la luz de la sección al mundo del proyecto con hover (0 = nada, 1 = todo)

// Los colores se crean UNA vez (cache por hex): cambiar de atmósfera nunca crea objetos nuevos.
const cache = new Map();
function color(THREE, hex) {
  let c = cache.get(hex);
  if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
  return c;
}
/** Crea todos los colores de todas las atmósferas por adelantado (se llama al cargar). */
export function warmColors(THREE) {
  [...SECTIONS, ...Object.values(PROJECTS), ...Object.values(SALAS)].forEach((a) => COLOR_KEYS.forEach((k) => {
    const hex = a[k] || (k === 'pColor' ? a.ember : null);
    if (hex) color(THREE, hex);
  }));
}

/** Un estado mezclable vacío (colores + números). Se reutiliza: ver fillState. */
export function createState(THREE) {
  const s = { az: 0, el: 0 };
  COLOR_KEYS.forEach((k) => (s[k] = new THREE.Color()));
  NUMBER_KEYS.forEach((k) => (s[k] = EXTRAS[k] ?? 0));
  return s;
}

/**
 * Llena `out` con la atmósfera de sección (+ tinte del proyecto con hover, o el mundo de la sala).
 * No crea nada. En una sala el hover no tiñe nada: la ventana de la sala es la protagonista.
 */
export function fillState(THREE, out, sectionIndex, projectId, salaId) {
  const base = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, sectionIndex))];
  const sala = salaId ? SALAS[salaId] : null;
  const p = !sala && projectId ? PROJECTS[projectId] : null;
  const w = sala || p;
  const k = sala ? ROOM_TINT : PROJECT_TINT;
  for (let i = 0; i < COLOR_KEYS.length; i++) {
    const key = COLOR_KEYS[i];
    out[key].copy(color(THREE, base[key] || base.ember));
    const hex = w && (w[key] || (key === 'pColor' ? w.ember : null));
    if (hex) out[key].lerp(color(THREE, hex), k);
  }
  for (let i = 0; i < BLENDED.length; i++) {
    const key = BLENDED[i];
    out[key] = w && w[key] !== undefined ? base[key] + (w[key] - base[key]) * k : base[key];
  }
  for (const key in EXTRAS) out[key] = sala && sala[key] !== undefined ? sala[key] : EXTRAS[key];
  out.az = sala ? sala.az : base.az;
  out.el = sala ? sala.el : base.el;
  return out;
}
