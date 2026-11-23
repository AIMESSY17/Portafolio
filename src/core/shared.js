// Estado compartido. Lectura para todos; escritura SOLO por el dueño indicado.
export function createShared() {
  return {
    wind: { x: 1, y: 0, z: 0, strength: 0 }, // ESCRIBE: fondo
    pointer: { x: 0, y: 0 },                  // ESCRIBE: core (normalizado -1 a 1)
    tilt: { x: 0, y: 0 },                     // ESCRIBE: core (giroscopio, -1 a 1)
    focusProjectId: null,                     // ESCRIBE: estatua
    reducedMotion: false,                     // ESCRIBE: core (prefers-reduced-motion)
    // lente (la aplica el core en una pasada): flare y aberracion los ESCRIBE el fondo; dof y rect, la estatua
    lente: { flare: 0, aberracion: 0, dof: 0, rect: null, rays: 0, grade: 0 },
    niebla: 0,                                // ESCRIBE: fondo. 0..1, cuánto está la cámara adentro de una nube
    // caída automática del cielo al mar (ESCRIBE: core/caida.js): on = en curso, dir = 1 baja / -1 sube,
    // q = 0..1 avance de la toma (tiempo), skip = la están saltando
    caida: { on: false, dir: 1, q: 0, skip: false },
  };
}
