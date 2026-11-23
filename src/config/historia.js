// Guion del scroll (compartido: lo leen fondo, estatua y ui). Versión 3, "fotográfica".
// La Victoria cae del cielo al mar: arriba de un mar de nubes de día → atraviesa la capa de nubes a toda
// velocidad → sale el horizonte del atardecer y el mar abajo → se acerca hasta quedar a pocos metros del agua
// (ahí el oro se derrite en cromo líquido) → las salas → la orilla a la hora azul, con estrellas.
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

/** Altura del mar (y de la arena de la orilla) cuando ya llegamos. La estatua flota encima. */
export const NIVEL_MAR = -1.15;

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

const OBRAS = START.obras, CONTACTO = START.contacto;

// ---------- la caída ----------
// Altura de la estatua sobre el mar, en metros del mundo 3D (escala de escena) y en metros "de verdad"
// para los datos de la esquina. Arriba (hero) estamos por encima de la capa de nubes.
export const CAIDA = {
  tramo: [0.85, OBRAS - 0.08], // cuándo cae
  puerta: 0.88,                // al llegar el scroll a este P (final del hero) se dispara la caída automática (core/caida.js)
  alto: 112,                   // altura al empezar (m de escena)
  nubes: 82,                   // altura de la capa de nubes (m de escena): ahí se atraviesa
  espesor: [-9, 20],           // la capa ocupa de nubes-9 a nubes+20
  altoReal: 3200,              // lo que dice la esquina arriba de todo (m)
  finalReal: 4,                // lo que dice al llegar (a pocos metros del agua)
};
/** Altura (m de escena) de la estatua sobre el mar en P. 0 = llegó (flota sobre el agua). */
export function altura(P) {
  return CAIDA.alto * (1 - ramp(P, CAIDA.tramo));
}
/** La altura "de verdad" para los datos de la esquina (m). */
export function alturaReal(P) {
  const k = 1 - ramp(P, CAIDA.tramo);
  return CAIDA.finalReal + (CAIDA.altoReal - CAIDA.finalReal) * Math.pow(k, 1.6);
}
// P en el que la cámara pasa por la capa de nubes (se calcula una vez)
function cruce() {
  let a = CAIDA.tramo[0], b = CAIDA.tramo[1];
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (altura(m) > CAIDA.nubes) a = m; else b = m; }
  return (a + b) / 2;
}
export const P_CRUCE = cruce();

export const TRAMOS = {
  oro: [0.62, P_CRUCE + 0.1],                 // el boceto y el oro se dibujan mientras cae
  atravesar: [P_CRUCE - 0.24, P_CRUCE + 0.24], // velo de nube al pasar por la capa (campana)
  atardecer: [P_CRUCE - 0.05, P_CRUCE + 0.05], // el panorama de día cambia al del atardecer ADENTRO de la nube
  mar: [P_CRUCE, P_CRUCE + 0.3],              // aparece el mar abajo
  aberracion: [0.9, OBRAS - 0.15],            // aberración cromática leve solo durante la caída
  fragmentos: [0.78, OBRAS - 0.35],           // fragmentos de cromo flotando alrededor
  aguaFragmentos: [OBRAS - 0.42, OBRAS - 0.12], // los fragmentos caen al agua
  llegada: [P_CRUCE + 0.12, OBRAS - 0.05],    // la cámara pasa a la pose sobre el mar
  cromo: [OBRAS - 0.4, OBRAS + 0.12],         // (v3, sin uso) el oro se derretía en cromo
  alquimia: [P_CRUCE - 0.12, CAIDA.tramo[1] - 0.05], // el mármol se transmuta en oro pulido de abajo hacia arriba
  noche: [CONTACTO, CONTACTO + 0.75],         // del atardecer a la hora azul (Contacto)
  estrellas: [CONTACTO + 0.35, CONTACTO + 1.0],
};

/** Hora del día de la escena (para los datos de la esquina), en minutos desde la medianoche. */
export function horaEscena(P) {
  // 12:40 en el cielo → 19:52 al llegar al mar (el atardecer) → 20:34 en la orilla (hora azul)
  const a = ramp(P, [0.6, OBRAS]), b = ramp(P, TRAMOS.noche);
  return 12 * 60 + 40 + a * (7 * 60 + 12) + b * 42;
}
