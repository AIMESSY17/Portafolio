// Estado compartido. Lectura para todos; escritura SOLO por el dueño indicado.
export function createShared() {
  return {
    wind: { x: 1, y: 0, z: 0, strength: 0 }, // ESCRIBE: fondo
    pointer: { x: 0, y: 0 },                  // ESCRIBE: core (normalizado -1 a 1)
    tilt: { x: 0, y: 0 },                     // ESCRIBE: core (giroscopio, -1 a 1)
    focusProjectId: null,                     // ESCRIBE: estatua
    reducedMotion: false,                     // ESCRIBE: core (prefers-reduced-motion)
  };
}
