// Atmósferas: cómo se ve la sala en cada sección y en el mundo de cada proyecto (hover).
// sun: color de la luz principal · az/el: desde dónde llega (radianes, alrededor de la estatua; az 0 = de frente)
// fill: luz de relleno del otro lado · dome*: cielo (arriba, abajo, resplandor) · ember: color de las brasas
// scan: visión nocturna (0–1) · ink: humo de tinta (0–1) · embers: cantidad relativa de brasas

export const SECTIONS = [
  { // hero — amanecer: la luz entra rasante desde arriba a la izquierda
    word: 'VICTORIA', sun: '#FFB15A', sunI: 1.0, az: -2.1, el: 0.85, fill: '#7E8FB0', fillI: 0.35,
    domeTop: '#05060B', domeBot: '#100B07', domeGlow: '#2E1C0C', ember: '#FF9A3C', embers: 0.6, beam: 1.0, scan: 0, ink: 0,
  },
  { // proyectos — mediodía dorado, desde arriba
    word: 'OBRAS', sun: '#FFD9A6', sunI: 1.1, az: 1.45, el: 1.0, fill: '#8C9BB8', fillI: 0.3,
    domeTop: '#06070B', domeBot: '#0F0B08', domeGlow: '#2A1C0C', ember: '#FFC46A', embers: 0.45, beam: 0.85, scan: 0, ink: 0,
  },
  { // sobre nosotros — atardecer, desde la derecha
    word: 'OFICIO', sun: '#FF8A3D', sunI: 1.05, az: 2.25, el: 0.55, fill: '#5E6E9A', fillI: 0.3,
    domeTop: '#07060B', domeBot: '#140A06', domeGlow: '#361A0A', ember: '#FF7A2E', embers: 0.75, beam: 1.0, scan: 0, ink: 0,
  },
  { // contacto — noche de fragua: contraluz desde atrás y muchas brasas
    word: 'ENCARGOS', sun: '#FF6A2A', sunI: 1.15, az: 3.0, el: 0.32, fill: '#3E4C78', fillI: 0.28,
    domeTop: '#040409', domeBot: '#180904', domeGlow: '#4A1A08', ember: '#FF5A1E', embers: 1.0, beam: 0.9, scan: 0, ink: 0,
  },
];

// Mundos de cada proyecto (se aplican encima de la sección mientras dura el hover)
export const PROJECTS = {
  'caballo-de-guerra': { sun: '#FF3B26', sunI: 1.1, fill: '#40121A', fillI: 0.35, domeTop: '#060102', domeBot: '#1C0404', domeGlow: '#4A0B06', ember: '#FF2A12', embers: 0.8, beam: 0.9, scan: 0, ink: 1 },
  'mantra-estetica':   { sun: '#D9B6FF', sunI: 1.0, fill: '#FFC2A6', fillI: 0.45, domeTop: '#0C0814', domeBot: '#1E1224', domeGlow: '#40284E', ember: '#F2C6FF', embers: 0.5, beam: 0.9, scan: 0, ink: 0 },
  'aura-aika':         { sun: '#FF7E48', sunI: 1.15, fill: '#FF5F9E', fillI: 0.5, domeTop: '#150A20', domeBot: '#3E1610', domeGlow: '#7A3818', ember: '#FFB070', embers: 0.5, beam: 1.0, scan: 0, ink: 0 },
  'zurklima':          { sun: '#7CF06A', sunI: 0.85, fill: '#1C5A24', fillI: 0.35, domeTop: '#010602', domeBot: '#031606', domeGlow: '#0C3812', ember: '#9CFF8A', embers: 0.3, beam: 0.45, scan: 1, ink: 0 },
  'la-pastoril':       { sun: '#FFD67A', sunI: 1.05, fill: '#A6D88A', fillI: 0.45, domeTop: '#0A0D07', domeBot: '#1E1A0B', domeGlow: '#4A3A12', ember: '#FFE7A0', embers: 0.45, beam: 1.0, scan: 0, ink: 0 },
  'chufas':            { sun: '#FFC9D6', sunI: 1.0, fill: '#BFE6DA', fillI: 0.5, domeTop: '#110D12', domeBot: '#201719', domeGlow: '#4E3036', ember: '#FFE0E8', embers: 0.45, beam: 0.9, scan: 0, ink: 0 },
  'casa-de-muffin':    { sun: '#FFB3CB', sunI: 1.05, fill: '#FFF0A8', fillI: 0.5, domeTop: '#160C12', domeBot: '#2A1820', domeGlow: '#5A3040', ember: '#FFD1DC', embers: 0.5, beam: 0.95, scan: 0, ink: 0 },
};

/** Estado mezclable (colores ya convertidos) a partir de sección + proyecto con hover. */
export function makeState(THREE, sectionIndex, projectId) {
  const base = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, sectionIndex))];
  const p = projectId ? PROJECTS[projectId] : null;
  const s = { ...base, ...(p || {}), az: base.az, el: base.el, word: base.word };
  const c = (k) => new THREE.Color(s[k]);
  // en los mundos de proyecto el cielo se tiñe pero sigue oscuro (la luz cuenta la historia, no el fondo)
  const dark = (k, f) => (p ? c(k).multiplyScalar(f) : c(k));
  return {
    sun: c('sun'), fill: c('fill'), domeTop: dark('domeTop', 0.45), domeBot: dark('domeBot', 0.42), domeGlow: dark('domeGlow', 0.55), ember: c('ember'),
    sunI: s.sunI, fillI: s.fillI, embers: s.embers, beam: s.beam, scan: s.scan, ink: s.ink, az: s.az, el: s.el,
  };
}
