// Guion del scroll de "Hecha de luz" (compartido: lo leen fondo, estatua y ui).
// La Victoria baja del cielo al mar: nubes de día → se derriten y la cámara las atraviesa → atardecer
// dorado sobre el mar con las obras → la orilla a la hora azul.
//
// P = posición del CENTRO de la pantalla, en pantallas (100vh) desde el tope de la página.
// Arriba de todo P = 0.5. Cada tramo es [desde, hasta] en P.
import { sections } from './sections.js';

export const START = {};
export const HEIGHT = {};
let acc = 0;
for (const s of sections) { START[s.id] = acc; HEIGHT[s.id] = s.height; acc += s.height; }
export const TOTAL = acc;

/** scrollState → P (sin crear objetos). */
export function posicion(st) {
  const s = sections[st?.section] || sections[0];
  return START[s.id] + (st?.sectionProgress || 0) * s.height;
}

/** Altura del mar (y de la arena de la orilla). La estatua flota encima y se posa ahí en Contacto. */
export const NIVEL_MAR = -1.15;

const OBRAS = START.obras, CONTACTO = START.contacto;
export const TRAMOS = {
  derretir: [0.6, 1.5],              // las nubes se derriten en píxeles hacia abajo
  atravesar: [0.95, 1.75],           // la cámara atraviesa la capa de nubes (campana: sube y baja)
  atardecer: [1.15, 1.85],           // el cielo de día pasa a un atardecer dorado
  mar: [1.25, 1.95],                 // aparece el mar debajo
  llegada: [1.45, OBRAS - 0.05],     // la estatua y la cámara pasan a la pose sobre el mar
  totem: [1.65, OBRAS - 0.12],       // las ventanas se arman como un tótem al lado de la estatua
  noche: [CONTACTO, CONTACTO + 0.75], // del atardecer a la hora azul (Contacto)
};

/** 0..1 suave dentro del tramo. */
export function ramp(x, [a, b]) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** 0 → 1 → 0 dentro del tramo (campana). */
export function bump(x, [a, b]) {
  const t = (x - a) / (b - a);
  if (t <= 0 || t >= 1) return 0;
  const s = Math.sin(Math.PI * t);
  return s * s;
}
